# 550 · Confier la phase de questions au modèle « Plans et organisation »

> Demande [#550](https://github.com/phoibe/factory/issues/550) · 2026-11-24

**En une phrase** : toute la réflexion en amont d'une demande (analyse, questions, alertes, fiche, ainsi que le cadrage d'un nouveau projet et l'analyse d'un bug) est faite par le modèle choisi pour « Plans et organisation », et plus par le modèle de la routine.

### Ce que j'ai décidé pour vous
- L'agent qui pilote continue de publier les messages, de poser les étiquettes et de mettre à jour le tableau ; seul le travail de réflexion (analyse de la demande, choix des questions, recommandations, rédaction de la fiche) passe au modèle « Plans et organisation ».
- Même une petite demande claire, qui saute les questions, voit sa fiche rédigée par ce modèle.
- Le chat du tableau reste sur le modèle de la routine, pour répondre vite.
- Si vous changez le modèle « Plans et organisation » dans les Réglages généraux, les questions et les fiches suivent ce choix dès la demande suivante.

### Ce qui change pour vous
1. **Questions sur une nouvelle demande** : vous recevez les questions comme aujourd'hui, au même format, mais elles ont été choisies et formulées par le modèle « Plans et organisation » (aujourd'hui Fable). Chaque tour prend environ une à deux minutes de plus.
2. **Fiche de la demande** : la fiche (« Spec ») publiée à la fin des questions, ou directement pour une petite demande claire, est rédigée par ce même modèle.
3. **Cadrage d'un nouveau projet** : les questions et la fiche produit du cadrage passent aussi par ce modèle.
4. **Bug** : l'analyse du bug avant sa correction passe aussi par ce modèle (la correction elle-même reste au modèle « Écriture du code »).
5. **Preuve** : le journal de fabrication montré dans chaque PR indique que les questions et la fiche ont bien été faites par le modèle « Plans et organisation ». Si ce n'est pas le cas, la PR ne peut pas s'ouvrir (même verrou que pour les autres étapes).

### Règles et cas limites
- Les alertes (demande sensible, doublon, demande déjà réglée) sont repérées par ce modèle ; c'est toujours le pilote qui pose l'étiquette ou ferme.
- Si le lancement de ce modèle échoue, l'agent réessaie avec le rôle au-dessus (« Revue »), comme pour le code, sans vous déranger.
- Les demandes déjà en cours au moment de la livraison continuent normalement ; le changement s'applique à leur prochain tour.

### Hors périmètre
- Le chat du tableau (onglet Agent) : il garde le modèle de la routine.
- Les réglages eux-mêmes : aucun nouveau réglage, le rôle « Plans et organisation » existant suffit.

### Comment vérifier
- Créez une petite demande de test sur un projet : les questions (ou la fiche) arrivent comme d'habitude.
- Ouvrez le lien « Voir ce qu'il fait » de ce run : on y voit un sous-agent lancé avec le modèle « Plans et organisation ».
- Dans la PR de cette demande, le journal de fabrication indique que les questions et la fiche ont été faites par ce modèle.
- Changez le modèle « Plans et organisation » dans les Réglages généraux, lancez une nouvelle demande : le journal montre le nouveau modèle.

J'ai précisé dans le glossaire que le rôle « Plans et organisation » couvre aussi la phase amont d'une demande, le cadrage et l'analyse d'un bug.
