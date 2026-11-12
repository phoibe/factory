# Étape : mise à jour de la branche

La factory n'a pas pu fusionner la PR : la branche est en retard ou en conflit avec `main`.

1. Récupère la branche de la PR, puis `git fetch origin main && git merge origin/main` (pas de rebase).
2. Résous les conflits en gardant le comportement des deux côtés ; en cas de doute fonctionnel, explique
   le choix au propriétaire en une phrase simple, mets `factory:blocked` sur l'issue et termine.
   Un conflit dans `docs/specs/README.md` (le sommaire des specs) ne se résout pas à la main : garde l'une ou l'autre
   version, puis lance `node .factory/scripts/specs.mjs index`, qui le reconstruit à partir des specs des deux côtés.
3. Vérifications locales (`typecheck`, `lint`, `test`, `build`), push.
4. Labels de la PR : retire `factory:fixing`, ajoute `factory:checks`.
