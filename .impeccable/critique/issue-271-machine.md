# Critique — « Machine des tâches » (Paramètres), issue #271

Mode : Operate. Écrans : section ajoutée à l'onglet Paramètres, ordinateur (clair, serveur hors ligne) et téléphone (sombre, en ligne).
Questions skipped: run autonome de la factory.

Score initial : 32/40 — score final : 35/40.

## Constat
- Hiérarchie claire : l'état du serveur en tête, coloré selon la gravité (vert en ligne, rouge hors ligne ou clé manquante, gris sinon), puis les deux choix « Pour tous les projets » et « Pour ce projet ».
- Réutilise les rangées radio, les filets et les couleurs existants de DESIGN.md (aucune nouvelle couleur ni police).
- Téléphone : le libellé long « Comme le réglage général (serveur de dev) » passe sur deux lignes proprement ; cibles tactiles ≥ 44 px.

## Problèmes
- [P1] Phrase explicative en bas de section (« Les projets publics tournent toujours… ») : contraire à la règle « Textes à l'écran ». **Corrigé : retirée.** Le cas public est dit par la ligne d'état elle-même quand il s'applique.
- [P2] Titres de groupe en `h3` sans `h2` : ordre des titres signalé par axe. **Corrigé : simples libellés de groupe (radiogroup).**
- [P3] Sur un projet public, les choix restent actifs alors qu'ils n'ont pas d'effet. Laissé : la ligne d'état le dit, et le réglage resservira si le projet devient privé.
