const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const os = require('os');

/**
 * Scans a bare repository for outdated dependencies in package.json
 * @param {string} bareRepoPath 
 */
function scan(bareRepoPath) {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-dep-scan-'));
    
    try {
        // Clone into temp dir
        execSync(`git clone ${bareRepoPath} ${tempDir}`);
        
        const pkgPath = path.join(tempDir, 'package.json');
        if (!fs.existsSync(pkgPath)) return cleanup(tempDir);

        console.log(`[DEP SCAN] Scanning ${bareRepoPath}...`);
        
        // Use `npm outdated --json` to check for updates
        // Note: This requires npm to be installed and works best if there's a package-lock.json
        try {
            const outdatedJson = execSync(`npm outdated --json`, { cwd: tempDir }).toString();
            const outdated = JSON.parse(outdatedJson || '{}');
            
            let updated = false;
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

            for (const [name, info] of Object.entries(outdated)) {
                // If current != latest and it's not a major version change (simple heuristic)
                if (info.current !== info.latest && info.latest.split('.')[0] === info.current.split('.')[0]) {
                    console.log(`[DEP SCAN] Updating ${name} to ${info.latest}`);
                    execSync(`npm install ${name}@${info.latest} --save`, { cwd: tempDir });
                    updated = true;
                }
            }

            if (updated) {
                execSync(`git add package.json package-lock.json`, { cwd: tempDir });
                execSync(`git commit -m "chore: automatic dependency updates"`, { cwd: tempDir });
                execSync(`git push origin main`, { cwd: tempDir });
                console.log(`[DEP SCAN] Pushed updates to ${bareRepoPath}`);
            }

        } catch (err) {
            // npm outdated returns exit code 1 if there are outdated packages
            if (err.stdout) {
                // Handle the json output even on exit 1
            } else {
                console.error(`[DEP SCAN] Error during scan:`, err.message);
            }
        }

    } catch (e) {
        console.error(`[DEP SCAN] Failed to clone or scan:`, e.message);
    } finally {
        cleanup(tempDir);
    }
}

function cleanup(dir) {
    if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

module.exports = { scan };
