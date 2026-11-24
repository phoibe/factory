# L'agent ne lit pas les messages des inconnus, même quand le propriétaire les approuve

Sur un projet public, n'importe qui peut écrire un message dans une demande du propriétaire, le modifier quand il veut et
y cacher du texte invisible à l'écran ; l'agent relisait tout le fil et pouvait prendre ce texte pour une consigne.
Décidé avec le propriétaire (#565) : le message d'un inconnu est laissé de côté avant d'arriver à l'agent, qui sait
seulement qu'un message se trouvait là, partout où il relit des messages (demandes, modifications et leurs remarques de
relecture, conversations). Le laisser lire ces messages comme une simple information, avec la consigne de ne pas leur
obéir, a été écarté : la protection n'aurait reposé que sur la prudence de l'agent face à un texte écrit exprès pour le
tromper. En contrepartie, une remarque utile d'un inconnu ne compte que si le propriétaire la redit dans un message à lui.

Pour la même raison que la copie d'une demande (décision 0014), l'accord du propriétaire ne suffit pas à faire lire le
message : l'inconnu peut le changer après le « oui ». L'agent demande donc au propriétaire de redire avec ses mots ce
qu'il veut reprendre. Lire le message désigné, tel qu'il est au moment de l'accord, a été écarté.

Les messages des robots branchés (l'hébergeur qui donne le lien de l'aperçu) restent lus, comme une information.
