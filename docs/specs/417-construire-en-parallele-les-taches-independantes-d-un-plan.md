# 417 · Construire en parallèle les tâches indépendantes d'un plan

> Demande [#417](https://github.com/phoibe/factory/issues/417) · 2026-11-15

**En une phrase** : pendant la construction d'une grande demande, les tâches du plan qui ne dépendent pas les unes des autres sont construites en même temps (3 au plus), pour que la demande soit prête plus vite.

### Ce que j'ai décidé pour vous
- Au moment du plan, chaque tâche est marquée « parallélisable » ou « séquentielle », avec la tâche dont elle dépend.
- Chaque tâche lancée en même temps travaille dans sa propre copie du projet, pour que les assistants ne se marchent pas dessus.
- Après la réunion des tâches, tous les tests sont relancés sur l'ensemble ; chaque tâche reste relue comme aujourd'hui, et la relecture finale ne change pas.
- Le journal de fabrication montré dans la PR indique quelles tâches ont tourné en même temps.

### Le parcours
1. **Plan** (grandes demandes seulement) : l'assistant découpe la demande en tâches comme aujourd'hui, et marque pour chacune si elle peut partir en même temps que d'autres (elle ne touche pas les mêmes fichiers ni les mêmes tests et n'attend aucune autre tâche) ou si elle doit attendre une tâche précise.
2. **Construction** : les tâches prêtes à partir sont confiées à des sous-assistants, jusqu'à 3 à la fois. Quand une se termine, la suivante prête prend sa place. Une tâche qui dépend d'une autre ne part qu'une fois celle-ci terminée et réunie.
3. **Réunion** : le travail de chaque tâche terminée est rassemblé dans la demande, puis tous les tests sont relancés.
4. **Relecture, contrôles, captures, recette** : inchangés.

### Règles et cas limites
- Petites et moyennes demandes : rien ne change, un seul assistant code tout d'une traite.
- Jamais plus de 3 sous-assistants en même temps ; s'il y a plus de tâches prêtes, elles attendent une place.
- Plan sans aucune tâche parallélisable : la construction se fait l'une après l'autre, comme aujourd'hui.
- Conflit à la réunion (deux tâches ont quand même touché le même endroit) : l'assistant principal le règle seul quand c'est simple ; sinon il refait la tâche en cause après l'autre. Vous n'êtes jamais dérangé pour ça.
- Tests rouges après la réunion : l'assistant cherche et corrige la cause avant la relecture, comme pour un test rouge aujourd'hui.
- Les règles de modèle des sous-assistants et la montée d'un cran en cas d'échec restent les mêmes.

### Hors périmètre
- Paralléliser les petites et moyennes demandes.
- Construire plusieurs demandes différentes en même temps (c'est déjà géré par les places de la factory).
- Un réglage pour changer le nombre maximum (3) depuis le panneau.

### Comment vérifier
- Sur la prochaine grande demande d'un de vos projets, le plan indique pour chaque tâche « parallélisable » ou « séquentielle ».
- Dans la PR de cette demande, le journal de fabrication montre quelles tâches ont tourné en même temps, jamais plus de 3.
- Les contrôles automatiques de cette PR sont au vert, comme d'habitude.
- Sur une petite ou moyenne demande, rien ne change dans la PR.
