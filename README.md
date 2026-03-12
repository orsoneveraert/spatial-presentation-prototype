# Spatial Presentation Prototype

Frontend statique pour GitHub Pages, backend WhisperX séparé, navigation vocale en francais.

## Etat actuel

- surface noire avec cadres 16:9 vides, traits blancs `1px`, point central blanc plein
- zoom recentre presque plein ecran sur un cadre
- numerotation `p.01` visible seulement en vue d'ensemble
- navigation vocale avec une seule gachette:
  - toute conjugaison de `aller`
  - toute conjugaison de `regarder`
  - une fois la gachette entendue, un mot directeur doit arriver dans les `10` secondes
- chaque page est pilotee par un concept temporel francais, avec synonymes

Exemples:

- `vais aube`
- `regarde zenith`
- `allez crepuscule`
- `regardons minuit`
- `ensemble`

## Architecture de deploiement

- frontend statique: GitHub Pages
- backend transcription: service FastAPI + WhisperX heberge a part
- liaison frontend -> backend: variable `VITE_API_BASE_URL`

Le frontend est maintenant compatible GitHub Pages:

- le `base path` Vite est calcule automatiquement depuis le nom du repo en CI
- les assets publics suivent `import.meta.env.BASE_URL`
- le backend peut etre local en dev ou distant en production

## Lancer en local

Frontend:

```bash
npm install
npm run dev
```

Backend WhisperX local:

```bash
uv venv --python /usr/local/bin/python3.11 .venv-whisperx
.venv-whisperx/bin/python -m ensurepip
.venv-whisperx/bin/pip3 install -r server/requirements.txt
.venv-whisperx/bin/python -m uvicorn server.main:app --host 127.0.0.1 --port 8000
```

Optionnel pour utiliser une API distante en local:

```bash
cp .env.example .env
```

Puis renseigner `VITE_API_BASE_URL`.

## Deployer le frontend sur GitHub Pages

Le frontend est compatible avec GitHub Pages:

- soit en publiant un build statique sur une branche `gh-pages`
- soit plus tard via GitHub Actions si tu remets un workflow de deploiement

Variable frontend minimale:

- `VITE_API_BASE_URL=https://ton-backend-whisperx.example.com`

Optionnel:

- `VITE_BASE_PATH=/` si tu utilises un domaine custom ou une configuration speciale

Si `VITE_BASE_PATH` est vide, Vite utilise automatiquement `/<nom-du-repo>/` pour un repo Pages standard.

## Deployer le backend WhisperX

Un conteneur backend est pret dans [server/Dockerfile](/Users/orsoneveraert/Documents/Playground/server/Dockerfile).

Exemple de build:

```bash
docker build -f server/Dockerfile -t spatial-whisperx .
docker run -p 8000:8000 \
  -e WHISPERX_ALLOW_ORIGINS=https://ton-user.github.io \
  spatial-whisperx
```

Variables backend utiles:

- `WHISPERX_MODEL=base`
- `WHISPERX_DEVICE=cpu`
- `WHISPERX_COMPUTE_TYPE=int8`
- `WHISPERX_ENABLE_ALIGNMENT=false`
- `WHISPERX_ALLOW_ORIGINS=https://ton-user.github.io,https://ton-domaine.com`

En prototype, tu peux laisser `WHISPERX_ALLOW_ORIGINS=*`. En production, mieux vaut declarer explicitement l'URL GitHub Pages ou ton domaine custom.

## Fichiers principaux

- [src/App.tsx](/Users/orsoneveraert/Documents/Playground/src/App.tsx): scene + panneau cache + etat vocal
- [src/hooks/useWhisperTriggerRouter.ts](/Users/orsoneveraert/Documents/Playground/src/hooks/useWhisperTriggerRouter.ts): capture micro, fenetre de 10 secondes, logique de gachette
- [src/config/runtime.ts](/Users/orsoneveraert/Documents/Playground/src/config/runtime.ts): URL backend et base assets
- [src/data/scene.ts](/Users/orsoneveraert/Documents/Playground/src/data/scene.ts): concepts de pages et synonymes
- [server/main.py](/Users/orsoneveraert/Documents/Playground/server/main.py): API WhisperX
- [vite.config.ts](/Users/orsoneveraert/Documents/Playground/vite.config.ts): proxy local + base path GitHub Pages

## Notes

- Le premier appel WhisperX charge le modele, donc il est plus lent.
- Le backend actuel tourne en Python `3.11` parce que WhisperX ne supporte pas encore proprement Python `3.13+`.
- Le healthcheck est expose sur `/api/health`.
