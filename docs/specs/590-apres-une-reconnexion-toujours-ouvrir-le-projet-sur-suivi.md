# 590 · Après une reconnexion, toujours ouvrir le projet sur « Suivi »

> Demande [#590](https://github.com/phoibe/factory/issues/590) · 2026-11-25

**En une phrase** : après un retour à la page de connexion (déconnexion ou jeton refusé), le projet qui s'ouvre à la connexion suivante s'affiche toujours sur l'onglet « Suivi ».

### Ce que j'ai décidé pour vous
- Ça vaut dans les deux cas : après « Se déconnecter », et après un jeton refusé par GitHub puis un nouveau jeton collé.
- Ça vaut même si c'est le même compte et le même projet qui reviennent : une reconnexion repart toujours de « Suivi ».
- Ça vaut quel que soit l'onglet quitté : « Agent » comme « Paramètres ».
- Une coupure de réseau passagère, qui ne vous renvoie pas à la page de connexion, ne change pas d'onglet.
- Le reste ne bouge pas : changer de projet ramène toujours sur « Suivi », recliquer sur le projet déjà ouvert vous laisse où vous étiez.

### Ce qui change
J'ai vérifié dans le tableau de bord : le retour automatique sur « Suivi » n'est fait que lorsqu'on passe d'un projet à un autre. Une déconnexion efface le projet ouvert sans remettre l'onglet à zéro, si bien qu'à la connexion suivante, le premier projet s'affiche sur le dernier onglet utilisé (« Agent » ou « Paramètres »). Désormais, chaque retour à la page de connexion remet l'onglet sur « Suivi ».

### Comment vérifier
1. Ouvrez un projet, allez sur l'onglet « Agent », puis « Se déconnecter » dans le menu, et reconnectez-vous : le projet s'ouvre sur « Suivi ».
2. Même chose en partant de l'onglet « Paramètres ».
3. Rien d'autre ne change : sur « Paramètres », recliquez sur le projet déjà ouvert, vous restez sur « Paramètres » ; choisissez un autre projet, « Suivi » s'affiche.
