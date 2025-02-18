#!/bin/bash

#Script needs to be run from inside webssh2 folder#

curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash

nvm install node

cd ./app && npm i

npm run index.js
