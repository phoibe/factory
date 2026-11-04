#!/bin/bash
# Double-cliquez ce fichier sur votre Mac : il met dans la factory un projet que vous avez déjà commencé.
# Il lance toujours la dernière version du script de la factory (scripts/factory.sh), qui vous pose ses questions.
cd "$HOME" || exit 1
clear
bash <(curl -fsSL https://raw.githubusercontent.com/phoibe/factory/stable/scripts/factory.sh) adopter
echo
read -r -n 1 -p "C'est fini. Appuyez sur une touche pour fermer cette fenêtre." </dev/tty
echo
