# Étape : reprise après blocage

L'issue ou la PR était `factory:blocked` et le propriétaire a répondu. La factory a déjà retiré
`factory:blocked` : le tableau de suivi montre que tu travailles.

**Reprise automatique après une fusion** : si le JSON contient `"merged": [12, …]`, la factory a relancé la
carte toute seule : les demandes que tu attendais (ligne `factory-waits-for` de ton message de blocage) sont toutes
fusionnées. Mets ta branche à jour (`git fetch origin main && git merge origin/main`), puis reprends l'étape
interrompue, en tenant compte des messages qu'il aurait écrits depuis ton blocage.

**Demande que tu avais fermée toi-même** (déjà réglée, en double, obsolète) et dans laquelle il vient d'écrire : la
factory l'a rouverte, avec sa PR, à son étape. Relis ta raison de fermeture et sa réponse. S'il a raison, reprends
l'étape où elle en était. Sinon, explique-lui simplement pourquoi et redemande-lui (`factory:blocked`) : ne la
referme pas seul une seconde fois.

1. Relis ton message de blocage et sa réponse.
2. Si la réponse débloque : reprends l'étape interrompue (souvent `build.md` ou `bugfix.md`, en repartant de la
   branche existante).
3. Sinon, reformule ta question plus simplement et remets `factory:blocked` (sur l'issue, ou sur la PR si le
   blocage est sur la PR). Ton message se termine par ce qu'il doit faire : le tableau lui dira « Débloque
   l'agent », ton message doit dire la même chose.

Si le blocage venait des contrôles automatiques (la PR est restée rouge) : reprends la correction comme
dans `fix-checks.md`, puis remets `factory:checks` sur la PR.

Si le blocage était sur une PR en recette (un réglage à faire de son côté, par exemple chez l'hébergeur) et qu'il
est levé : remets `factory:checks` sur la PR. Les contrôles repartent, puis la factory lui redonne le lien de
test et attend son « ok ». Ne lui dis jamais que la factory met en ligne : seul son « ok » en recette le fait.
