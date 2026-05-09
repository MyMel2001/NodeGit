const fs = require('fs');
const path = require('path');
const yaml = require('yaml');
const { spawn } = require('child_process');

/**
 * Runs a simple CI/CD stub based on .github/workflows/*.yml
 * @param {string} bareRepoPath Path to the bare repository
 */
function run(bareRepoPath) {
    // 1. Create a temporary worktree to checkout the latest code
    const tempDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'git-ci-'));
    
    try {
        // Clone from the bare repo
        spawn('git', ['clone', bareRepoPath, tempDir]).on('close', (code) => {
            if (code !== 0) return cleanup(tempDir);

            const workflowsDir = path.join(tempDir, '.github', 'workflows');
            if (!fs.existsSync(workflowsDir)) return cleanup(tempDir); // No workflows

            const files = fs.readdirSync(workflowsDir).filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));
            
            files.forEach(file => {
                const content = fs.readFileSync(path.join(workflowsDir, file), 'utf8');
                try {
                    const parsed = yaml.parse(content);
                    // Extremely simplified parsing: just look for jobs -> * -> steps -> run
                    if (parsed && parsed.jobs) {
                        for (const [jobId, job] of Object.entries(parsed.jobs)) {
                            const image = job['runs-on'] === 'ubuntu-latest' ? 'node:20-slim' : 'node:20-slim'; // Mapping for stub
                            if (job.steps) {
                                console.log(`[CI] Starting job ${jobId} in Docker container (${image})`);
                                
                                // Join all steps into a single shell script
                                const script = job.steps
                                    .filter(s => s.run)
                                    .map(s => `echo ">>> ${s.name || s.run}" && ${s.run}`)
                                    .join('\n');

                                const docker = spawn('docker', [
                                    'run', '--rm',
                                    '-v', `${tempDir}:/workspace`,
                                    '-w', '/workspace',
                                    image,
                                    'sh', '-c', script
                                ]);

                                docker.stdout.on('data', d => console.log(`[CI][${jobId}] ${d}`));
                                docker.stderr.on('data', d => console.error(`[CI][${jobId}] ERR: ${d}`));
                                docker.on('close', (code) => {
                                    console.log(`[CI][${jobId}] Finished with code ${code}`);
                                    cleanup(tempDir);
                                });
                            }
                        }
                    }
                } catch (e) {
                    console.error(`[CI] Error parsing workflow ${file}:`, e);
                }
            });

            // Note: Cleanup should happen after execution is done, but since this is async, 
            // a proper implementation would await all child processes. 
            // For now we skip cleanup to avoid race conditions in the stub.
        });
    } catch (e) {
        console.error('CI Runner error:', e);
    }
}

function cleanup(dir) {
    fs.rmSync(dir, { recursive: true, force: true });
}

module.exports = { run };
