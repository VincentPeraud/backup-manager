# 🛡️ Backup Manager

![Version](https://img.shields.io/badge/version-0.1.0-blue?style=for-the-badge)

Backup Manager is a containerized backup orchestrator that keeps rsync-based retention policies tidy, runs preparatory commands, and notifies your team when jobs succeed or fail.

## 📚 Table of Contents

- [📚 Table of Contents](#-table-of-contents)
- [✨ Features](#-features)
- [⚙️ Requirements](#️-requirements)
- [🚀 Quick Start](#-quick-start)
- [🧑‍💻 Interactive Mode](#-interactive-mode)
- [🧰 Configuration](#-configuration)
    - [SSH key format](#ssh-key-format)
- [🐳 Docker Usage](#-docker-usage)
- [📬 Notifications](#-notifications)
- [🧪 Development](#-development)
- [📝 License](#-license)

## ✨ Features

- Declarative YAML configuration for servers, destinations, jobs, and retention rules.
- Incremental backups via rsync with daily, weekly, and monthly retention pruning.
- Pre-backup shell commands for dumping databases or preparing artifacts.
- Optional Mattermost notifications on success or failure (Slack planned but not implemented yet).
- Ships as a ready-to-run Docker image for consistent execution anywhere Docker is available.
- Interactive terminal workflow to launch jobs, list remote backups, and download snapshots.

## ⚙️ Requirements

- Docker Engine with the Compose plugin (or Docker Desktop).
- Access to your preferred container registry hosting the Backup Manager image.
- Mounted SSH key that can reach your rsync destination.
- Any tooling needed by your pre-commands available either inside the container or via mounted sockets (for example the Docker socket).

## 🚀 Quick Start

1. Create a working directory on the host that will run the backups:
    ```bash
    mkdir -p ~/ops/backup-manager
    cd ~/ops/backup-manager
    ```
2. Place `config.yml` and `compose.yml` in this directory (copy or download the samples from this repository).
3. Edit `config.yml` to define your destinations, jobs, retention policy, and notifications.
4. Adjust `compose.yml` so that it points to the published image (example below) and mount every volume you want to back up.
5. Launch a backup run:
    ```bash
    docker compose pull
    docker compose run --rm backup-manager
    ```
6. (Optional) Mount a host directory at `/shared` when you want to download backups via the interactive mode.

The container prints progress spinners, executes pre-commands, performs rsync transfers, and tidies old backups according to your retention policy.

## 🧑‍💻 Interactive Mode

- Launch locally with `yarn interactive` (or the shorthand `yarn i`) to pick jobs, run backups, list remote snapshots, or download archives.
- When running the Docker image, invoke `docker compose run --rm backup-manager interactive` to start the same prompt-driven workflow.
- Downloads are written to `/shared/<job-name>/<timestamp>/`; mount a host directory at `/shared` (see `compose.sample.yml`) to keep retrieved data after the container exits.

## 🧰 Configuration

- `settings.server_name`: friendly name used in log output and notifications.
- `settings.retention`: number of daily, weekly, and monthly snapshots to keep.
- `settings.destinations`: currently supports `rsync` targets (host, port, user, SSH key); `s3` is defined but not implemented yet.
- `jobs`: each job defines a destination, optional `pre_commands`, and a list of sources (`file` or `folder`). Use `{{TMP_DIR}}` within commands and paths to reference the per-job temporary directory.
- `notifications`: choose `mattermost` or `slack` for `on_success` and `on_failure`; provide the matching configuration section. Slack is not implemented yet, so only `mattermost` has effect today.

Use `config.sample.yml` as a starting point.

### SSH key format

- Prefer generating an Ed25519 key (`ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519`) for rsync destinations; it works out of the box in the container.
- If you keep using RSA, convert the private key to the legacy PEM format so OpenSSH can read it inside the container:  
  `ssh-keygen -p -m PEM -f ~/.ssh/id_rsa`

## 🐳 Docker Usage

- **Compose file**: start from `compose.sample.yml` and replace the build section with your published image. For example:

    ```
    services:
        backup-manager:
            image: registry.example.com/backup-manager:latest
            restart: "no"
            volumes:
                - ./config.yml:/config.yml:ro
                - ~/.ssh/id_rsa_no_password:/id_rsa
                - my_website1_public_html:/volumes/my_website1_public_html:ro
                - my_website2_public_html:/volumes/my_website2_public_html:ro
                - ./shared:/shared

    volumes:
        my_website1_public_html:
            external: true
        my_website2_public_html:
            external: true
    ```

    Replace `registry.example.com/backup-manager:latest` with the actual image reference you publish.

- **Config file**: place `config.yml` next to your compose file and ensure every source path mounted into the container matches the paths configured in `jobs[].sources[].path`.

- **Shared folder**: map a host directory at `/shared` when you plan to download backups via the interactive mode.

- **Runtime**:
    - Non-interactive: `docker compose run --rm backup-manager`
    - Interactive: `docker compose run --rm backup-manager interactive`

## 📬 Notifications

- Success messages list each backed-up source.
- Failure messages include the error message block.
- Mattermost credentials require a bot token, channel ID, and server URL.
- Slack support is scaffolded in the config schema but not implemented yet.

## 🧪 Development

- TypeScript sources live in `src/`.
- Run locally with `yarn start` if you need to iterate before publishing a new image.
- Format with your preferred Prettier setup if needed.
- Tests are not yet defined; add them under `src/` and wire them into `package.json` as needed.

## 📝 License

MIT © Vincent Peraud
