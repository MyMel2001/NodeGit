const express = require('express');
const router = express.Router();
const db = require('../database');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const svgCaptcha = require('svg-captcha');

// Home page
router.get('/', async (req, res) => {
    if (req.session.user) {
        const repos = await db.repos.all() || [];
        const userRepos = repos.filter(r => r.value.owner === req.session.user.username);
        res.render('dashboard', { repos: userRepos });
    } else {
        res.render('index');
    }
});
// Captcha
router.get('/captcha', (req, res) => {
    const captcha = svgCaptcha.create({
        size: 5,
        noise: 3,
        color: true,
        background: '#f6f8fa'
    });
    req.session.captcha = captcha.text.toLowerCase();
    res.type('svg');
    res.status(200).send(captcha.data);
});

// Login
router.get('/login', (req, res) => res.render('login', { error: null }));
router.post('/login', async (req, res) => {
    const { username, password, captcha } = req.body;
    
    if (!captcha || captcha.toLowerCase() !== req.session.captcha) {
        return res.render('login', { error: 'Invalid captcha' });
    }

    const user = await db.users.get(username);
    if (user && await bcrypt.compare(password, user.passwordHash)) {
        req.session.user = { username };
        delete req.session.captcha; // Clear captcha after success
        res.redirect('/');
    } else {
        res.render('login', { error: 'Invalid credentials' });
    }
});

// Register
router.get('/register', (req, res) => res.render('register', { error: null }));
router.post('/register', async (req, res) => {
    const { username, password, captcha } = req.body;

    if (!captcha || captcha.toLowerCase() !== req.session.captcha) {
        return res.render('register', { error: 'Invalid captcha' });
    }

    if (await db.users.get(username)) {
        return res.render('register', { error: 'Username taken' });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    await db.users.set(username, { username, passwordHash });
    req.session.user = { username };
    delete req.session.captcha; // Clear captcha after success
    res.redirect('/');
});

// Logout
router.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// Search
router.get('/search', async (req, res) => {
    const q = (req.query.q || '').toLowerCase();
    
    const allRepos = await db.repos.all() || [];
    const repos = allRepos
        .map(r => r.value)
        .filter(r => r && r.name && (r.name.toLowerCase().includes(q) || r.owner.toLowerCase().includes(q)))
        .filter(r => !r.isPrivate || (req.session.user && req.session.user.username === r.owner));
        
    const allUsers = await db.users.all() || [];
    const users = allUsers
        .map(u => u.value)
        .filter(u => u && u.username && u.username.toLowerCase().includes(q));
        
    res.render('search', { query: q, repos, users });
});

// User Profile
router.get('/user/:username', async (req, res) => {
    const username = req.params.username;
    const profileUser = await db.users.get(username);
    if (!profileUser) return res.status(404).send('User not found');
    
    const allRepos = await db.repos.all() || [];
    const repos = allRepos
        .map(r => r.value)
        .filter(r => r && r.owner === profileUser.username)
        .filter(r => !r.isPrivate || (req.session.user && req.session.user.username === r.owner));
        
    res.render('user', { profileUser, repos });
});

// Create Repo
router.get('/new', (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    res.render('new_repo');
});

router.post('/new', async (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    const { name, isPrivate } = req.body;
    const owner = req.session.user.username;
    
    // Create git repo on disk
    const repoPath = path.join(__dirname, '..', 'repos', owner, name + '.git');
    if (fs.existsSync(repoPath)) {
        return res.status(400).send('Repo already exists');
    }
    fs.mkdirSync(repoPath, { recursive: true });
    execSync(`git init --bare`, { cwd: repoPath });
    
    // Save to DB
    const repoData = {
        owner,
        name,
        isPrivate: isPrivate === 'on',
        createdAt: Date.now()
    };
    await db.repos.set(`${owner}_${name}`, repoData);
    
    res.redirect(`/${owner}/${name}`);
});

// Middleware for repo access
const ensureRepoAccess = async (req, res, next) => {
    const { owner, repo } = req.params;
    const repoData = await db.repos.get(`${owner}_${repo}`);
    if (!repoData) return res.status(404).send('Repo not found');
    
    if (repoData.isPrivate) {
        if (!req.session.user || req.session.user.username !== owner) {
            return res.status(404).send('Repo not found'); // return 404 instead of 403 to hide existence
        }
    }
    
    req.repoData = repoData;
    next();
};

// View Repo
router.get('/:owner/:repo', ensureRepoAccess, async (req, res) => {
    const { owner, repo } = req.params;
    const repoData = req.repoData;
    
    const repoPath = path.join(__dirname, '..', 'repos', owner, repo + '.git');
    let files = [];
    let commits = [];
    let branches = [];
    
    let readmeContent = null;
    
    try {
        const lsTree = execSync(`git ls-tree -r HEAD --name-only`, { cwd: repoPath }).toString();
        files = lsTree.split('\n').filter(Boolean);
        
        const log = execSync(`git log -n 5 --oneline`, { cwd: repoPath }).toString();
        commits = log.split('\n').filter(Boolean);

        const branchList = execSync(`git branch --format='%(refname:short)'`, { cwd: repoPath }).toString();
        branches = branchList.split('\n').filter(Boolean);
        
        const readmeFile = files.find(f => f.toLowerCase() === 'readme.md' || f.toLowerCase() === 'readme.txt' || f.toLowerCase() === 'readme');
        if (readmeFile) {
            readmeContent = execSync(`git show HEAD:${readmeFile}`, { cwd: repoPath }).toString();
        }
    } catch (err) {
        commits = ['Empty repository'];
    }
    
    res.render('repo', { repo: repoData, files, commits, branches, readmeContent });
});

// Fork Repo
router.post('/:owner/:repo/fork', ensureRepoAccess, async (req, res) => {
    const { owner, repo } = req.params;
    const { repoData } = req;
    
    if (!req.session.user) return res.redirect('/login');
    const currentUser = req.session.user.username;
    
    if (currentUser === owner) {
        return res.status(400).send('Cannot fork your own repository');
    }
    
    // Check if fork already exists
    const newRepoName = repo;
    const existingRepo = await db.repos.get(`${currentUser}_${newRepoName}`);
    if (existingRepo) {
        return res.status(400).send('You already have a repository with this name');
    }
    
    const newRepoData = {
        owner: currentUser,
        name: newRepoName,
        isPrivate: repoData.isPrivate,
        createdAt: Date.now(),
        forkedFrom: `${owner}/${repo}`
    };
    
    const originalRepoPath = path.join(__dirname, '..', 'repos', owner, repo + '.git');
    const newRepoPath = path.join(__dirname, '..', 'repos', currentUser, newRepoName + '.git');
    
    try {
        fs.mkdirSync(newRepoPath, { recursive: true });
        execSync(`git clone --bare ${originalRepoPath} ${newRepoPath}`);
        await db.repos.set(`${currentUser}_${newRepoName}`, newRepoData);
        res.redirect(`/${currentUser}/${newRepoName}`);
    } catch (e) {
        return res.status(500).send('Error forking repository: ' + e.message);
    }
});

// Settings Routes
router.get('/:owner/:repo/settings', ensureRepoAccess, (req, res) => {
    const { repoData } = req;
    if (!req.session.user || req.session.user.username !== repoData.owner) {
        return res.status(403).send('Forbidden');
    }
    res.render('repo_settings', { repo: repoData });
});

router.post('/:owner/:repo/settings/privacy', ensureRepoAccess, async (req, res) => {
    const { owner, repo } = req.params;
    const { repoData } = req;
    if (!req.session.user || req.session.user.username !== owner) return res.status(403).send('Forbidden');
    
    repoData.isPrivate = req.body.isPrivate === 'on';
    await db.repos.set(`${owner}_${repo}`, repoData);
    res.redirect(`/${owner}/${repo}/settings`);
});

router.post('/:owner/:repo/settings/delete', ensureRepoAccess, async (req, res) => {
    const { owner, repo } = req.params;
    if (!req.session.user || req.session.user.username !== owner) return res.status(403).send('Forbidden');
    
    await db.repos.delete(`${owner}_${repo}`);
    const repoPath = path.join(__dirname, '..', 'repos', owner, repo + '.git');
    if (fs.existsSync(repoPath)) {
        fs.rmSync(repoPath, { recursive: true, force: true });
    }
    res.redirect('/');
});

// PR Routes
router.get('/:owner/:repo/pulls', ensureRepoAccess, async (req, res) => {
    const { owner, repo } = req.params;
    const allPulls = await db.pullRequests.all();
    const pulls = allPulls.filter(p => p.id.startsWith(`${owner}_${repo}_`));
    res.render('pulls', { owner, repo, pulls });
});

router.get('/:owner/:repo/pull/new', ensureRepoAccess, async (req, res) => {
    const { owner, repo } = req.params;
    const repoPath = path.join(__dirname, '..', 'repos', owner, repo + '.git');
    const branches = execSync(`git branch --format='%(refname:short)'`, { cwd: repoPath }).toString().split('\n').filter(Boolean);
    res.render('new_pull', { owner, repo, branches });
});

router.post('/:owner/:repo/pull/new', ensureRepoAccess, async (req, res) => {
    const { owner, repo } = req.params;
    const { title, base, head } = req.body;
    const id = `${owner}_${repo}_${Date.now()}`;
    await db.pullRequests.set(id, {
        id, owner, repo, title, base, head, 
        status: 'open', 
        author: req.session.user.username,
        createdAt: Date.now()
    });
    res.redirect(`/${owner}/${repo}/pulls`);
});

router.get('/:owner/:repo/pull/:id', ensureRepoAccess, async (req, res) => {
    const { owner, repo, id } = req.params;
    const pr = await db.pullRequests.get(id);
    if (!pr) return res.status(404).send('PR not found');

    const repoPath = path.join(__dirname, '..', 'repos', owner, repo + '.git');
    const diff = execSync(`git diff ${pr.base}..${pr.head}`, { cwd: repoPath }).toString();
    
    res.render('pull_detail', { pr, diff });
});

router.post('/:owner/:repo/pull/:id/merge', ensureRepoAccess, async (req, res) => {
    const { owner, repo, id } = req.params;
    const pr = await db.pullRequests.get(id);
    if (!pr) return res.status(404).send('PR not found');

    const repoPath = path.join(__dirname, '..', 'repos', owner, repo + '.git');
    try {
        // Simple merge strategy: checkout base, merge head, push back
        // Since it's a bare repo, we need a temporary worktree
        const tempDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'git-merge-'));
        execSync(`git clone ${repoPath} ${tempDir}`);
        execSync(`git checkout ${pr.base}`, { cwd: tempDir });
        execSync(`git merge ${pr.head} --no-ff -m "Merge pull request #${id}: ${pr.title}"`, { cwd: tempDir });
        execSync(`git push origin ${pr.base}`, { cwd: tempDir });
        
        pr.status = 'merged';
        pr.mergedAt = Date.now();
        await db.pullRequests.set(id, pr);
        
        res.redirect(`/${owner}/${repo}/pull/${id}`);
    } catch (err) {
        res.status(500).send('Merge conflict or error: ' + err.message);
    }
});

// Releases
router.get('/:owner/:repo/releases', ensureRepoAccess, async (req, res) => {
    const { owner, repo } = req.params;
    const repoPath = path.join(__dirname, '..', 'repos', owner, repo + '.git');
    let releases = [];
    try {
        // List tags
        const tags = execSync(`git tag -l`, { cwd: repoPath }).toString().split('\n').filter(Boolean);
        releases = tags.map(tag => ({
            tag,
            name: tag,
            body: 'Release ' + tag,
            createdAt: new Date()
        }));
    } catch (e) {}
    res.render('releases', { owner, repo, releases });
});

router.get('/:owner/:repo/releases/new', ensureRepoAccess, (req, res) => {
    const { owner, repo } = req.params;
    res.render('new_release', { owner, repo });
});

router.post('/:owner/:repo/releases/new', ensureRepoAccess, async (req, res) => {
    const { owner, repo } = req.params;
    const { tag, title, body } = req.body;
    const repoPath = path.join(__dirname, '..', 'repos', owner, repo + '.git');
    try {
        execSync(`git tag -a ${tag} -m "${title}\n\n${body}"`, { cwd: repoPath });
        res.redirect(`/${owner}/${repo}/releases`);
    } catch (err) {
        res.status(500).send('Error creating release: ' + err.message);
    }
});

module.exports = router;
