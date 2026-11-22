# 530 · Afficher le score final de la passe design dans la demande

> Demande [#530](https://github.com/phoibe/factory/issues/530) · 2026-11-22

**En une phrase** : à la fin d'une passe design, la demande affiche directement le score de départ et le score final, sans avoir à ouvrir la PR.

### Ce que j'ai décidé pour vous
- un seul message, à la fin : la ligne de score s'ajoute au message qui donne déjà le lien de la PR (pas un message par tour de critique) ;
- la section « Design » de la PR reste comme aujourd'hui ;
- une feature qui ne touche aucun écran n'a pas de passe design, donc pas de ligne de score ;
- si vous demandez des retouches sur les captures, le score n'est pas recalculé.

### Ce qui change
- Feature, amélioration UI ou review générale avec une passe design : le message de fin dans la demande contient une ligne du type « Score design : 24/40 → 32/40 » (score de la première critique → score de la dernière).
- Quand la critique ne trouve rien à corriger : « Score design : 34/40, rien à corriger ».
- Amélioration UI fermée faute de problème : le message de fermeture donne aussi le score, avec la même mention.

### Comment vérifier
- Sur la prochaine demande qui touche un écran, le message de fin dans la demande montre « Score design : X/40 → Y/40 », avec les mêmes chiffres que la section « Design » de la PR.
- Sur une demande sans écran, ce message n'a pas de ligne de score.
