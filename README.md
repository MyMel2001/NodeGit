# NodeGit 🚀

A professional-grade, self-hosted Git frontend built with Node.js. NodeGit provides a streamlined interface for managing repositories, pull requests, and releases, with a strong focus on security and developer experience.

## ✨ Features

- **Git Hosting**: Create and manage bare Git repositories on your own server.
- **Pull Requests**: Full PR workflow including web-based diffing and merging.
- **Security First**:
  - **CAPTCHA**: Built-in verification for registrations and sign-ins to prevent bot activity.
  - **Encryption**: Support for encryption-at-rest for database operations.
  - **HTTPS**: Native support for secure transit.
  - **Secret Scanning**: Automatic scanning for sensitive data in your codebase.
  - **Dependency Scanning**: Keep your project safe with automated dependency vulnerability checks.
- **CI/CD**: Integrated runner for automated job execution (Docker-ready).
- **Themeable UI**: Beautiful, GitHub-esque light mode and a custom Lime-on-Black dark mode.
- **Release Management**: Create and view repository tags and releases.
- **GitHub Import**: Seamlessly import your entire repository collection from GitHub using either a Personal Access Token (for private repos) or just a username/organization name (for public repos). Features real-time progress reporting via streaming JSON and built-in heartbeats to prevent Cloudflare timeouts. Full pagination support ensures that even accounts with hundreds of repositories are imported completely. Built-in rate-limiting ensures we are kind to GitHub's APIs, and tokens are securely used for private repository authentication during the import process.

## 🛠️ Tech Stack

- **Backend**: Node.js, Express
- **Database**: SQLite (via `better-sqlite3` and `quick.db`)
- **Templating**: EJS
- **Styling**: Vanilla CSS (Custom design system)
- **Git**: Native Git integration via `child_process`

## 🚀 Getting Started

### Prerequisites

- Node.js (v18 or higher)
- Git installed on the server

### Installation

1. **Clone the repository**:

   ```bash
   git clone https://github.com/your-username/NodeGit.git
   cd NodeGit
   ```

2. **Install dependencies**:

   ```bash
   npm install
   ```

3. **Configure environment**:

   ```bash
   cp .env.example .env
   # Edit .env with your specific configuration
   ```

4. **Start the server**:
   ```bash
   npm run dev
   ```

The application will be available at `http://localhost:3000` (or the port specified in your `.env`).

## ⚙️ Configuration

The following environment variables can be configured in your `.env` file:

| Variable            | Description                              | Default                     |
| ------------------- | ---------------------------------------- | --------------------------- |
| `PORT`              | Port the server listens on               | `3000`                      |
| `SESSION_SECRET`    | Secret key for session management        | `super-secret-git-frontend` |
| `DB_ENCRYPTION_KEY` | 32-character key for database encryption | `None`                      |

## 🔒 Security

- **CAPTCHA**: The registration and login forms are protected by a custom server-side SVG CAPTCHA to prevent automated sign-ups.
- **HTTPS**: To enable HTTPS, place `key.pem` and `cert.pem` in the root directory. NodeGit will automatically detect them and switch to a secure server.

## 📜 License

This project is licensed under the terms found in the `LICENSE` file.

---

Built with ❤️ by the NodeGit contributors.
