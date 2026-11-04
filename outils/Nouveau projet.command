#!/bin/bash
# Double-clique ce fichier sur ton Mac : il crée un nouveau projet dans la factory.
# Il lance toujours la dernière version du script de la factory (scripts/factory.sh), qui te pose ses questions.
cd "$HOME" || exit 1
clear
bash <(curl -fsSL https://raw.githubusercontent.com/phoibe/factory/main/scripts/factory.sh) nouveau
echo
read -r -n 1 -p "C'est fini. Appuie sur une touche pour fermer cette fenêtre." </dev/tty
echo
