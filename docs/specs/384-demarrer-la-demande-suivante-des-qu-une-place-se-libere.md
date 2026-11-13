# 384 · Démarrer la demande suivante dès qu'une place se libère

> Demande [#384](https://github.com/phoibe/factory/issues/384) · 2026-11-13

**En une phrase** : dès qu'une place se libère, quelle qu'en soit la raison, la demande suivante de la file démarre tout de suite, sans attendre la vérification périodique.

### Ce que j'ai trouvé
- Une bonne partie marche déjà comme ça : quand une PR est fusionnée, quand une demande est fermée ou abandonnée, ou quand une carte en construction ouvre sa PR, la demande suivante démarre aussitôt.
- Il reste quelques trous : quand c'est **la factory elle-même** qui libère la place pendant un de ses propres traitements, rien ne relance la file. Par exemple :
  - elle bloque une carte en construction (fusion refusée par GitHub, mise en ligne qui échoue, contrôles qui n'aboutissent pas) ;
  - elle termine proprement une carte que l'agent avait laissée en cours (fin d'un agent qui n'a pas « rendu la main ») ;
  - elle traite le résultat des contrôles, de la preview ou de la mise en ligne.
- Dans ces cas, la file attend la vérification « toutes les 5 minutes »… qui, en pratique, passe bien plus rarement (GitHub ne la lance parfois que quelques fois par jour). L'attente peut donc durer bien plus que 5 minutes.

### Ce qui change
- À la fin de **chaque** traitement de la factory qui peut libérer une place, elle regarde la file et démarre la demande suivante s'il y a de la place.
- Rien ne change dans l'ordre de la file, ni dans le nombre maximum de demandes construites en même temps.
- La vérification périodique reste en place, comme filet de sécurité.

### Règles et cas limites
- Une demande ne démarre jamais deux fois, même si deux traitements libèrent une place au même moment.
- Si le démarrage échoue (service momentanément indisponible), la demande reste en file et repartira à la prochaine occasion, comme aujourd'hui.

### Hors périmètre
- Un agent qui s'arrête net sans prévenir : c'est le sujet de [#383](https://github.com/phoibe/factory/issues/383).
- Les autres idées de [#379](https://github.com/phoibe/factory/issues/379), qui ont chacune leur fiche.

### Critères d'acceptation
- Avec la factory pleine et une demande en file : quand la factory bloque une carte en construction, la demande en file démarre dans la minute, pas à la vérification suivante.
- Même chose quand la factory termine elle-même la carte d'un agent qui s'est arrêté, et après une fusion faite à la fin des contrôles.
- La demande en file ne démarre jamais si la factory est toujours pleine.
