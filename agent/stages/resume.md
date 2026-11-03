# Étape : reprise après blocage

L'issue était `factory:blocked` et le propriétaire a répondu.

1. Relis ton message de blocage et sa réponse.
2. Si la réponse débloque : retire `factory:blocked` et reprends l'étape interrompue (souvent `build.md`
   ou `bugfix.md`, en repartant de la branche existante).
3. Sinon, reformule ta question plus simplement et termine (le label reste `factory:blocked`).

Si le blocage venait des contrôles automatiques (la PR est restée rouge) : reprends la correction comme
dans `fix-checks.md`, puis remets `factory:checks` sur la PR.
