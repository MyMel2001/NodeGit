const express = require('express');
const router = express.Router();
const db = require('../database');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

router.get('/', (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    res.render('import', { error: null, success: null });
});

router.post('/', async (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    const { githubToken } = req.body;
    const owner = req.session.user.username;

    if (!githubToken) {
        return res.render('import', { error: 'GitHub Token is required', success: null });
    }

    try {
        // Fetch user info from GitHub
        const userResp = await fetch('https://api.github.com/user', {
            headers: { 'Authorization': `token ${githubToken}` }
        });
        if (!userResp.ok) throw new Error('Invalid GitHub Token');
        
        // Fetch public repos
        const reposResp = await fetch('https://api.github.com/user/repos?visibility=public', {
            headers: { 'Authorization': `token ${githubToken}` }
        });
        const githubRepos = await reposResp.json();

        let importedCount = 0;
        for (const repo of githubRepos) {
            const repoName = repo.name;
            const cloneUrl = repo.clone_url;
            
            const repoPath = path.join(__dirname, '..', 'repos', owner, repoName + '.git');
            if (fs.existsSync(repoPath)) continue; // skip existing

            fs.mkdirSync(repoPath, { recursive: true });
            
            // We do a mirror clone to get a bare repo with all branches
            const git = spawn('git', ['clone', '--mirror', cloneUrl, repoPath]);
            
            await new Promise((resolve) => {
                git.on('close', (code) => {
                    if (code === 0) {
                        importedCount++;
                        db.repos.set(`${owner}_${repoName}`, {
                            owner,
                            name: repoName,
                            isPrivate: false,
                            createdAt: Date.now(),
                            importedFrom: cloneUrl
                        });
                    }
                    resolve();
                });
            });
        }

        res.render('import', { error: null, success: `Successfully imported ${importedCount} repositories.` });

    } catch (err) {
        res.render('import', { error: err.message, success: null });
    }
});

module.exports = router;
