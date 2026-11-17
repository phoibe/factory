# 383 · Relancer tout seul quand le lancement de l'agent échoue

> Demande [#383](https://github.com/phoibe/factory/issues/383) · 2026-11-13

**En une phrase** : quand le lancement de l'agent échoue pour une raison passagère, la factory réessaie seule plus tard, et ne vous dérange qu'après plusieurs échecs.

### Ce qui change pour vous

1. **Un lancement échoue (service de Claude saturé, réseau, erreur momentanée, limite quotidienne de lancements atteinte)** : la carte reste dans sa colonne, avec la mention « Relance prévue à HH:MM ». Aucun message ne vous est envoyé. La factory réessaie 2 min plus tard, puis 10 min plus tard, puis toutes les 30 min.
2. **Au 3e échec d'affilée** : une seule phrase apparaît sur la carte : « Le service de Claude ne répond pas en ce moment, je réessaie tout seul, rien à faire de votre côté. »
3. **Un essai réussit** : l'agent démarre normalement, la mention disparaît. Votre message n'est pas perdu : l'agent le traite comme si le premier lancement avait marché.
4. **Au bout de 3 h sans succès** : la carte est mise de côté (bloquée), avec un message qui le dit. Vous répondez « réessaie » quand vous voulez.
5. **Vous écrivez dans la carte pendant l'attente** (un nouveau message ou « réessaie ») : la relance prévue est annulée et l'agent est lancé tout de suite, avec votre nouveau message en plus.

### Le chat « Questions »

Vous attendez une réponse en direct : une seule relance rapide, environ 30 secondes plus tard. Si elle échoue aussi, vous recevez tout de suite : « Le service de Claude est saturé, réessayez dans quelques minutes. » Pas de relances longues.

### Règles

- **Tous les lancements** sont concernés : votre réponse dans une carte, le démarrage d'une demande en file d'attente, une correction après un contrôle rouge, une mise à jour avant fusion, etc.
- **Échec de réglage** (secrets de la routine absents, factory pas installée dans le projet) : pas de relance, le message actuel qui vous explique quoi faire reste.
- **Plusieurs cartes en attente** : à chaque relance, la factory essaie d'abord la plus ancienne. Si elle échoue encore, les autres ne sont pas essayées tout de suite (inutile pendant une panne) : elles passent à la relance suivante. Si elle réussit, les suivantes sont essayées.

### Hors périmètre

- Les relances des contrôles automatiques (déjà en place, inchangées).
- Un agent qui démarre bien puis s'arrête en cours de route (déjà géré à part).

### Vérifications que vous pourrez faire

1. Sur la preview, une carte dont le lancement a échoué affiche « Relance prévue à … » au lieu de vous demander de réécrire.
2. Sans rien faire, l'agent finit par démarrer, et la mention disparaît.
3. Vous ne voyez une phrase sur la carte qu'à partir du 3e échec, et une seule fois.
4. Écrire « réessaie » pendant l'attente lance l'agent tout de suite.
5. Dans le chat « Questions », un échec donne une réponse claire en moins d'une minute.
