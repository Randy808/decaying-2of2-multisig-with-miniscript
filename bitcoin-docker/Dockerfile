FROM --platform=linux/amd64 ubuntu:22.04 
WORKDIR /app
COPY "./bitcoin.conf" "root/.bitcoin/bitcoin.conf"
RUN ["apt-get", "update", "-y"]
RUN ["apt-get", "install", "curl", "-y"]
RUN ["curl", "-O", "https://bitcoincore.org/bin/bitcoin-core-28.1/bitcoin-28.1-x86_64-linux-gnu.tar.gz"]
RUN ["curl", "-O", "https://bitcoincore.org/bin/bitcoin-core-28.1/SHA256SUMS"]
RUN ["sha256sum", "--ignore-missing", "--check", "SHA256SUMS"]
RUN ["tar", "-xvzf", "bitcoin-28.1-x86_64-linux-gnu.tar.gz"]
COPY scripts /root/scripts
RUN ["chmod", "+x", "/root/scripts/configure-aliases.sh"]
RUN ["/root/scripts/configure-aliases.sh"]
CMD ["/bin/bash"]