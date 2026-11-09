# Containerization, Image Optimization, and Orchestration Deployment

I use a small Node.js web app and Docker Compose. Each replica runs the same image. I start two replicas and scale to three for the test.

Live Demo URL: N/A - Local Docker Compose

## Architecture

My browser connects to a published port on my Mac. Docker maps that port to port 3000 in one container. Each replica gets its own port from 8081 to 8085. There is no load balancer.

- `/` is the landing page. It shows the hostname and uptime.
- `/healthz` returns HTTP 200 and `{"status":"ok"}`.
- `/info` returns the app name, environment, hostname, and uptime in seconds.
- `/favicon.ico` returns HTTP 204. The app does not need an icon file.

I use only Node built-in modules. There are no npm dependencies or native packages.

### Dockerfile

I use `node:22.23.4-alpine3.24` in both stages. This pins the version tag, not an immutable image digest. Alpine keeps the base small. Node 22 replaces the older Node 20 choice.

The first stage copies the package files before installing dependencies. A source-only change can reuse that layer. The second stage copies the app and dependency folder, not the npm cache. The process runs as `app`, UID 10001. The Dockerfile does not copy `.env` or secrets.

### Compose, Option A

- `image: containerization-web:1.0` gives the image a clear tag.
- `deploy.replicas: 2` states the intended replica count. I also use `--scale web=2` so the start command is explicit across Compose versions.
- The CPU limit is 0.5 CPU. The memory limit is 128 MB per replica.
- Reservations are 0.1 CPU and 64 MB. Local Compose is not a cluster scheduler.
- The health check calls `/healthz` every five seconds.
- `restart: unless-stopped` restarts a crashed process. An unhealthy check alone does not restart a container.
- `init: true` lets the container exit when the Node process dies.
- `.env` supplies the app settings at runtime. I create it locally from `.env.example`.

Compose gives me local scaling and crash recovery. It does not give me Kubernetes-style rolling updates. This demo does not claim zero downtime during updates.

## Files

- `server.js`: web app
- `package.json` and `package-lock.json`: package metadata and lock file
- `Dockerfile`: two-stage image build
- `docker-compose.yml`: local replicas, limits, health check, and restart policy
- `.env.example`: local settings template, with no passwords or keys
- `.dockerignore`: excludes local files from the build context
- `.gitignore`: keeps local files like `.env` and `node_modules` out of Git
- `README.md`: run guide and test notes

## Prerequisites and Run Guide

I need Docker Desktop running on my Mac and Docker Compose v2. Ports 8081 to 8085 must be free. I start in the open project folder in the VS Code terminal. These commands work in macOS zsh.

### Build and start

```bash
cp .env.example .env
docker compose build --no-cache
docker images containerization-web
docker compose up -d --scale web=2 --wait
docker compose ps
```

### Access and check the app

I read the published port instead of assuming it is 8081.

```bash
APP_PORT=$(docker compose port --index 1 web 3000 | awk -F: 'NR==1 {print $NF}')
printf 'Open http://localhost:%s/\n' "$APP_PORT"
curl -i "http://localhost:$APP_PORT/"
curl -i "http://localhost:$APP_PORT/healthz"
curl -i "http://localhost:$APP_PORT/info"
docker compose top
docker compose exec --index 1 web id
```

I open the printed URL in my browser. The `id` command should show `uid=10001(app)`. I use Cmd+Option+I to open DevTools. In Network, I reload the page and check status codes, headers, and timing. In Console, I check for uncaught errors. I also visit `/healthz` and `/info`.

### Scale to three

```bash
docker compose up -d --scale web=3 --wait
docker compose ps
for i in {1..3}; do docker compose exec -T --index "$i" web hostname; done
```

All three replicas should be healthy. Their hostnames should be different.

### Main self-healing test: crash the app process

I save the second container ID using its default hostname. I compare its restart count before and after the crash.

```bash
CRASH_ID=$(docker compose exec -T --index 2 web hostname)
docker inspect "$CRASH_ID" --format 'RestartCount={{.RestartCount}} Status={{.State.Status}} Health={{.State.Health.Status}}'
docker compose exec --index 2 web pkill -9 node
```

The exec command may return a nonzero code because it kills the app. I wait about five seconds, then run the next commands. If health still says `starting`, I run the inspect command again after a few seconds. I do not start the service myself during this test.

```bash
docker compose ps
docker inspect "$CRASH_ID" --format 'RestartCount={{.RestartCount}} Status={{.State.Status}} Health={{.State.Health.Status}}'
APP_PORT_2=$(docker compose port --index 2 web 3000 | awk -F: 'NR==1 {print $NF}')
curl -i "http://localhost:$APP_PORT_2/info"
```

The same container should return to healthy with a higher restart count. It is a restart, not a newly scheduled replacement container.

### Short manual kill comparison

```bash
KILL_ID=$(docker compose exec -T --index 3 web hostname)
docker kill "$KILL_ID"
docker compose ps -a
docker inspect "$KILL_ID" --format 'RestartCount={{.RestartCount}} Status={{.State.Status}} ExitCode={{.State.ExitCode}}'
```

It stays stopped because Docker treats `docker kill` as a manual stop under `unless-stopped`.

I restore it only after showing that difference.

```bash
docker compose up -d --scale web=3 --wait
docker compose ps
```

### Tear down

```bash
docker compose down
```

To remove the built image too, I use:

```bash
docker image rm containerization-web:1.0
```

## What I had to patch

These fixes are recorded in the earlier October 28 test notes. They are not new Mac test results.

1. `docker kill` left the container stopped. The main test now crashes Node with `pkill -9 node`. The Compose file has `init: true` so the container exits and its restart policy can work.
2. With no npm packages, `npm ci` did not create `node_modules`. The next stage could not copy it. `mkdir -p node_modules` fixes that build step.
3. `npm cache clean --force` gave a warning. It was removed. The cache stays in the first stage and is not copied into the runtime image.
4. The missing favicon caused a browser 404. The server now returns HTTP 204 for that path.
5. The base image was changed from Node 20 to the pinned Node 22 Alpine tag.

## Container audit

| Check | What is in the files |
| --- | --- |
| Layer caching | Package files are copied before the source |
| Multi-stage build | Separate dependency and runtime stages |
| Non-root | Explicit user and group with UID and GID 10001 |
| Small pinned base | Exact Node and Alpine version tag |
| Limits and health | CPU, memory, `/healthz`, and restart policy in Compose |
| Secrets | No keys or passwords included, `.env` excluded from build context |

## QA Checklist Summary

The following results are from the earlier Linux test on October 28, 2026, Pacific time. They are not results from my Mac. I still need to repeat these checks on my Mac and show them live in my recording. Image size may differ on Apple Silicon.

| Check | Earlier result, October 28, 2026 |
| --- | --- |
| Clean build | Build completed with no warnings or errors |
| Image tag and size | `containerization-web:1.0`, 168 MB |
| Non-root | `uid=10001(app)`, process UID 10001 |
| Landing page | HTTP 200 |
| Health | HTTP 200 with `{"status":"ok"}` |
| Hostnames | Two different hostnames, `ba8a39223e89` and `05a237abbfa7` |
| Scale | Three healthy replicas, each `/info` returned HTTP 200 |
| Process crash | RestartCount changed from 0 to 1, healthy again after about five seconds |
| Manual kill | Container stayed exited with code 137 |
| Resource limit inspection | Memory 134217728 bytes, NanoCpus 500000000 |
| Browser proof | I still need to show Network and Console live on my Mac |

I take proof screenshots on my own Mac. I show my build, image size, non-root user, endpoints, three healthy replicas, and restart count. I record my screen and webcam together. I add the real video link and timestamps after recording.

## AI Transparency

AI was used to create part of this file and to clean up its writing and formatting.
