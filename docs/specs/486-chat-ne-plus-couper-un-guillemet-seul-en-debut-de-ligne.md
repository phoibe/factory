# 486 · Chat : ne plus couper un guillemet « » » seul en début de ligne

> Demande [#486](https://github.com/phoibe/factory/issues/486) · 2026-11-18

**En une phrase** : dans le chat de l'onglet « Agent », les guillemets « et » restent toujours collés au mot qu'ils entourent, même sur un écran étroit.

### Ce que j'ai décidé pour vous
- Les deux guillemets sont concernés : « ne se retrouve jamais seul en fin de ligne, » jamais seul en début de ligne.
- Cela vaut pour les réponses de l'agent comme pour vos propres messages dans le chat.
- Seul l'affichage change : copier le texte d'un message (en le sélectionnant) donne toujours le texte exact, sans modification.

### Ce qui change
À l'affichage d'un message du chat, l'espace qui sépare un guillemet de son mot devient une espace qui ne se coupe pas. Le retour à la ligne se fait alors avant ou après le mot entier, guillemets compris.

### Comment vérifier
1. Sur téléphone (ou une fenêtre très étroite), ouvrez l'onglet « Agent » et posez une question dont la réponse contient des mots entre guillemets, par exemple « Suivi ».
2. Vérifiez qu'aucune ligne ne commence par « » » et qu'aucune ne se termine par « « ».
3. Sélectionnez la réponse, copiez-la et collez-la ailleurs : il est identique à la réponse de l'agent.
