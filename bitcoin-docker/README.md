docker build . -t bitcoin-docker

docker run -it -v ${PWD}/bitcoin.conf:/root/.bitcoin/bitcoin.conf -v ${PWD}/scripts:/root/scripts -p 18443:18443 bitcoin-docker

