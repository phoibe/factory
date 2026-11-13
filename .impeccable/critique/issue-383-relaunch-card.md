# Critique — carte « Relance prévue à HH:MM » (issue #383)

Mode Operate. Deux évaluations indépendantes (revue design, détecteur + captures clair/sombre, téléphone/ordinateur).
Questions skipped: run autonome de la factory.

Score de la première critique : 3/4 de moyenne sur les heuristiques notées (aucun P0, deux P1).

| Point | Priorité | Décision |
| --- | --- | --- |
| La ligne « Ensuite ~56 min de travail des agents » contredit l'état (aucun agent ne travaille) | P1 | Corrigé : ligne d'estimation masquée tant que la relance attend |
| « Relance » peu clair | P1 | Gardé : texte exact de la spec validée par le propriétaire |
| Trop proche visuellement de « Un agent travaille » | P2 | Corrigé : texte en gris discret, graisse normale (tokens existants) |
| Heure déjà passée affichée comme « prévue » | P3 | Corrigé : « Relance imminente » une fois l'heure passée |
| Lane « Les agents travaillent » | P2 | Gardé : pas de nouvelle colonne (bruit), l'état de la ligne suffit |
| Heure en chiffres mono | P3 | Gardé : règle « Mono Numbers » de DESIGN.md, comme les autres heures |

Détecteur : rien sur la nouvelle ligne ; seulement des points déjà présents avant (police, rayon 8 px).
Pas de recritique : la première n'a trouvé aucun P0, et ses P1 retenus sont corrigés ; les captures servent de contrôle final.
