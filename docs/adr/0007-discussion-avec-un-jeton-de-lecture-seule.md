# La discussion n'utilise qu'un jeton de lecture seule

Le serveur de discussion (onglet « Agent ») ne reçoit plus qu'un second jeton GitHub qui ne peut que lire les projets ;
le jeton complet ne quitte jamais le navigateur, et c'est le panneau qui enregistre les conversations et crée les demandes.
Sans ce second jeton, ou s'il est refusé, il n'y a pas de discussion : jamais de solution de secours avec le jeton complet,
sinon le risque d'une fuite depuis le serveur resterait entier. Décidé par le propriétaire dans la demande #395.
