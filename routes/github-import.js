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
    if (!req.session.user) return res.status(401).send('Unauthorized');
    const { githubToken, githubUsername } = req.body;
    const owner = req.session.user.username;

    if (!githubToken && !githubUsername) {
        return res.status(400).json({ error: 'GitHub Token or Username is required' });
    }

    // Set headers for streaming
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Transfer-Encoding', 'chunked');

    const sendUpdate = (data) => {
        res.write(JSON.stringify(data) + '\n');
    };

    // Heartbeat interval to keep connection alive
    const heartbeat = setInterval(() => {
        res.write(': heartbeat\n');
    }, 15000);

    try {
        let githubRepos = [];
        sendUpdate({ status: 'fetching', message: 'Fetching repository list from GitHub...' });
        
        if (githubToken) {
            const userResp = await fetch('https://api.github.com/user', {
                headers: { 'Authorization': `token ${githubToken}` }
            });
            if (!userResp.ok) throw new Error('Invalid GitHub Token');
            
            let page = 1;
            while (true) {
                const reposResp = await fetch(`https://api.github.com/user/repos?per_page=100&page=${page}`, {
                    headers: { 'Authorization': `token ${githubToken}` }
                });
                const pageRepos = await reposResp.json();
                if (!Array.isArray(pageRepos) || pageRepos.length === 0) break;
                githubRepos = githubRepos.concat(pageRepos);
                page++;
            }
        } else {
            let page = 1;
            while (true) {
                const reposResp = await fetch(`https://api.github.com/users/${githubUsername}/repos?per_page=100&page=${page}`);
                if (!reposResp.ok) {
                    if (page === 1) throw new Error('Could not find GitHub user or organization');
                    break;
                }
                const pageRepos = await reposResp.json();
                if (!Array.isArray(pageRepos) || pageRepos.length === 0) break;
                githubRepos = githubRepos.concat(pageRepos);
                page++;
            }
        }

        sendUpdate({ status: 'starting', total: githubRepos.length, message: `Found ${githubRepos.length} repositories. Starting import...` });

        let importedCount = 0;
        for (let i = 0; i < githubRepos.length; i++) {
            const repo = githubRepos[i];
            if (repo.private && !githubToken) continue;

            const repoName = repo.name;
            let cloneUrl = repo.clone_url;
            if (githubToken) {
                cloneUrl = cloneUrl.replace('https://', `https://${githubToken}@`);
            }
            
            const repoPath = path.join(__dirname, '..', 'repos', owner, repoName + '.git');
            if (fs.existsSync(repoPath)) {
                sendUpdate({ status: 'skipping', repo: repoName, message: `Skipping ${repoName} (already exists)` });
                continue;
            }

            sendUpdate({ status: 'cloning', repo: repoName, current: i + 1, total: githubRepos.length, message: `Cloning ${repoName}...` });

            fs.mkdirSync(repoPath, { recursive: true });
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

            if (i < githubRepos.length - 1) {
                await new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * 2000) + 3000));
            }
        }

        clearInterval(heartbeat);
        sendUpdate({ status: 'done', count: importedCount, message: `Successfully imported ${importedCount} repositories.` });
        res.end();

    } catch (err) {
        clearInterval(heartbeat);
        sendUpdate({ status: 'error', error: err.message });
        res.end();
    }
});

module.exports = router;
