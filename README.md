# Software factory

Une usine à logiciel personnelle : une issue GitHub devient une spec validée, du code testé et relu, des
captures avant/après, des contrôles automatiques, une preview, puis une mise en ligne. Le propriétaire
n'intervient qu'en français, à trois portes : la spec, les captures, la recette.

- **Panneau** : https://phoibe.github.io/factory/ (règles de chaque projet et suivi)
- **Nouveau projet ou projet existant** : [télécharger les outils Mac](https://github.com/phoibe/factory/releases/download/outils/factory-outils.zip) (deux fichiers à double-cliquer, voir `outils/`) ; le README de https://github.com/phoibe/factory-template explique la mise en route
- **Version stable** : les projets suivent la branche `stable`, pas `main`. Le bouton « Déclarer stable » du panneau relance les tests puis y ajoute les derniers changements, avec une version numérotée (onglet Releases).
- **Conception** : [docs/design.md](docs/design.md)

## Comment ça marche

```
Issue / commentaire / PR ──► GitHub Actions (relay.yml) ──► decide() + labels factory:*
                                    │
             ┌──────────────────────┼─────────────────────────────┐
             ▼                      ▼                             ▼
   Agent Claude (routine     Contrôles (checks.mjs)      Merge, file d'attente,
   cloud, ou Actions)        types, lint, tests,          messages au propriétaire
   grilling, spec, plan,     build, a11y, audit
   TDD, revue, impeccable,
   captures, PR
```

- Un run n'attend jamais un humain : il pose sa question, change un label et s'arrête. La réponse du
  propriétaire déclenche le run suivant.
- Les étapes intelligentes tournent dans une **routine Claude Code** (cloud Anthropic, abonnement du
  propriétaire). Les étapes déterministes (contrôles, merge, file d'attente) tournent dans **GitHub Actions**.
- Les skills (superpowers, Matt Pocock, impeccable) sont copiés dans `packs/` à un commit figé, et installés
  dans chaque projet selon ses règles par `scripts/sync.mjs`. Une PR mensuelle propose leurs mises à jour.

## Contenu

| Dossier | Rôle |
| --- | --- |
| `agent/` | Instructions de l'agent (`AGENT.md`, une fiche par étape) et script de captures |
| `packs/` | Skills figés, `catalog.json` (liste et descriptions), licences |
| `defaults/`, `schema/` | Règles par défaut d'un projet et leur schéma |
| `scripts/` | Orchestrateur (`relay.mjs`), décisions (`lib/decide.mjs`), synchro, contrôles, mise à jour des skills |
| `panel/` | Panneau web statique (GitHub Pages) |
| `.github/workflows/` | Workflows réutilisables appelés par les projets, CI, Pages, mise à jour mensuelle |

## Mise en route de la factory elle-même (une seule fois)

1. **Settings** → **Pages** → *Build and deployment* → *Source* : **GitHub Actions**. Le panneau se publie à
   chaque modification de `panel/`.
2. **Settings** → **Actions** → **General** → coche **Allow GitHub Actions to create and approve pull
   requests**, pour la PR mensuelle des skills.

## Limites connues

- Le jeton du panneau est stocké dans le navigateur, sur `phoibe.github.io`. Ce domaine est partagé par tous
  les sites GitHub Pages du compte : n'y publie pas de site tiers.
- Les projets doivent appartenir au compte personnel (pas à une organisation) : seul le propriétaire du
  dépôt peut déclencher l'agent.

## Développement

```
npm test                          # tous les tests (aucune dépendance d'exécution)
npm run typecheck && npm run lint && npm run build
npm install && npm run test:a11y  # accessibilité du panneau (Playwright + axe-core, outils de développement)
node scripts/vendor.mjs           # recopie les skills aux commits de packs/sources.json
node scripts/vendor.mjs --latest  # passe chaque pack à sa dernière version
node scripts/sync.mjs ../projet   # installe la factory dans un projet local
```
