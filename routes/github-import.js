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
    const { githubToken, githubUsername } = req.body;
    const owner = req.session.user.username;

    if (!githubToken && !githubUsername) {
        return res.render('import', { error: 'GitHub Token or Username is required', success: null });
    }

    try {
        let githubRepos = [];
        
        if (githubToken) {
            // Fetch user info from GitHub to verify token
            const userResp = await fetch('https://api.github.com/user', {
                headers: { 'Authorization': `token ${githubToken}` }
            });
            if (!userResp.ok) throw new Error('Invalid GitHub Token');
            
            // Fetch all repos accessible by this token
            const reposResp = await fetch('https://api.github.com/user/repos?per_page=100', {
                headers: { 'Authorization': `token ${githubToken}` }
            });
            githubRepos = await reposResp.json();
        } else {
            // Fetch public repos for a specific user/org
            const reposResp = await fetch(`https://api.github.com/users/${githubUsername}/repos?per_page=100`);
            if (!reposResp.ok) throw new Error('Could not find GitHub user or organization');
            githubRepos = await reposResp.json();
        }

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

            // Be kind to GitHub and our server: 3-5 second delay between imports
            if (importedCount < githubRepos.length) {
                await new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * 2000) + 3000));
            }
        }

        res.render('import', { error: null, success: `Successfully imported ${importedCount} repositories.` });

    } catch (err) {
        res.render('import', { error: err.message, success: null });
    }
});

module.exports = router;
