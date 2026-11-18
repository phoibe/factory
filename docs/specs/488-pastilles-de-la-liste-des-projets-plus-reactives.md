# 488 · Pastilles de la liste des projets plus réactives

> Demande [#488](https://github.com/phoibe/factory/issues/488) · 2026-11-18

**En une phrase** : les pastilles des autres projets dans la liste se mettent à jour plus vite, surtout quand vous revenez sur le panneau ou que vous l'utilisez.

### Ce que j'ai décidé pour vous
- Dès que vous revenez sur l'onglet du panneau, toutes les pastilles sont revérifiées aussitôt (aujourd'hui, seul le tableau du projet ouvert l'était).
- Quand vous êtes actif sur le panneau, les autres projets sont vérifiés toutes les 10 secondes au lieu de 30 ; après 2 minutes sans geste de votre part, ou onglet caché, on revient à 30 secondes (le même principe que le tableau du projet ouvert).
- Un geste après un moment de calme relance aussitôt une vérification des pastilles, sans attendre la fin des 30 secondes.
- Rien à faire pour vos actions (« go », « ok »…) : elles se font sur le projet ouvert, dont la pastille suit déjà son tableau, rafraîchi toutes les 8 secondes. L'ouverture de la liste des projets revérifie déjà les pastilles, je le garde.
- Cela ne coûte presque rien en appels à GitHub : une réponse « rien n'a changé » n'est pas décomptée de la limite horaire.

### Ce qui change
Les pastilles de la liste des projets (et celle à côté du nom du projet ouvert, qui résume les autres) collent davantage à la réalité. Le délai propre à la factory pour changer l'étape d'une demande, lui, ne change pas.

### Comment vérifier
1. Laissez le panneau dans un autre onglet quelques minutes, pendant qu'un autre projet change d'état (par exemple une demande qui passe en attente de votre réponse). En revenant sur l'onglet, sa pastille se met à jour en quelques secondes.
2. Panneau ouvert et en main, quand un autre projet change d'état, sa pastille change en 10 à 15 secondes environ.
