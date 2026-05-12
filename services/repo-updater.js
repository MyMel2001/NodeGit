const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const db = require('../database');

function startAutoUpdater() {
    // Run every 5 minutes
    setInterval(async () => {
        try {
            const allRepos = await db.repos.all();
            // Filter only mirrored repositories
            const mirroredRepos = allRepos.filter(r => r.value && r.value.importedFrom);

            console.log(`[Repo Updater] Starting background update for ${mirroredRepos.length} mirrored repositories...`);

            for (let i = 0; i < mirroredRepos.length; i++) {
                const repo = mirroredRepos[i].value;
                const repoPath = path.join(__dirname, '..', 'repos', repo.owner, repo.name + '.git');

                if (fs.existsSync(repoPath)) {
                    console.log(`[Repo Updater] Updating ${repo.owner}/${repo.name}...`);
                    
                    const git = spawn('git', ['remote', 'update'], { cwd: repoPath });
                    
                    await new Promise((resolve) => {
                        git.on('close', (code) => {
                            if (code !== 0) {
                                console.error(`[Repo Updater] Failed to update ${repo.owner}/${repo.name}. Exit code: ${code}`);
                            }
                            resolve();
                        });
                    });
                }

                // Standard pseudorandomized delay (3000ms to 5000ms) between updates
                if (i < mirroredRepos.length - 1) {
                    const delay = Math.floor(Math.random() * 2000) + 3000;
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
            
            console.log(`[Repo Updater] Background update completed.`);
        } catch (err) {
            console.error('[Repo Updater] Error during background update:', err.message);
        }
    }, 5 * 60 * 1000);
}

module.exports = { startAutoUpdater };
