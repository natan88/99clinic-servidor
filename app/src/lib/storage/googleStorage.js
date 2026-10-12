/* jshint -W030 */

/**
 * Está classe irá trablhar com o Google Cloud Storage
 */
{
    "use strict";

    const {Storage} = require('@google-cloud/storage'),
    conf = require('src/util/config'),
    path = require('path'),
    mime = require('mime'),
    fs = require('fs'),
    { pipeline } = require('stream');

    // tutorial: https://www.woolha.com/tutorials/node-js-upload-file-to-google-cloud-storage
    // doc: https://cloud.google.com/docs/authentication/production#auth-cloud-implicit-nodejs
    // https://cloud.google.com/nodejs/docs/reference/storage/2.5.x/File
    // https://medium.com/better-programming/streaming-images-videos-to-google-cloud-storage-with-node-js-express-and-multer-%EF%B8%8F-7455c60f310

    class GoogleStorage {
        constructor () {
            let storageOptions = {
                projectId: conf.gcp.projectId,
                // keyFilename: "temp/google.json",
                credentials: {
                    client_email: conf.gcp.clientEmail,
                    private_key: conf.gcp.privateKey
                }
            };

            this.config = {
                bucketName: conf.gcp.storage.bucketName,
                pastaEmpresa: 'empresa',
                pastaUsuario: 'usuario',
                pastaPaciente: 'paciente',
                pastaProntuario: 'prontuario',
            };
            this.client = new Storage( storageOptions );
            this.bucket = this.client.bucket( this.config.bucketName );
        }

        getPastaEmpresa ( empresaID ) {
            return `${this.config.pastaEmpresa}/${empresaID}`;
        }

        getPastaUsuario ( empresaID, usuarioID ) {
            return `${this.getPastaEmpresa(empresaID)}/${this.config.pastaUsuario}/${usuarioID}`;
        }

        getPastaPaciente ( empresaID, pacienteID ) {
            return `${this.getPastaEmpresa(empresaID)}/${this.config.pastaPaciente}/${pacienteID}`;
        }

        getPastaProntuario ( empresaID, usuarioID ) {
            return `${this.getPastaUsuario(empresaID, usuarioID)}/${this.config.pastaProntuario}`;
        }

        getBucket () {
            return this.bucket;
        }

        /**
         * Envia para o GCS um arquivo que está armazenado no disco local.
         * 
         * @param {String} localFilePath local do arquivo no disco. pasta/nome_arquivo.extensao
         * @param {Strig} pastaDestino pasta onde o arquivo será salvo no GCS
         * @param {String} nomeArquivoDestino nome do arquivo, sem a extensão. A extensão será a mesma do arquivo local
         */
        salvaArquivoDoDisco ( localFilePath, pastaDestino, nomeArquivoDestino ) {
            return new Promise( ( resolve, reject ) => {

                const nomeArquivoDestinoFinal = `${nomeArquivoDestino}${path.extname( localFilePath )}`;
                const optionsStream = {
                    metadata: {
                        contentType: mime.getType( localFilePath )
                    }
                };
                const file = this.bucket.file( `${pastaDestino}/${nomeArquivoDestinoFinal}` );

                pipeline(
                    fs.createReadStream( localFilePath ),
                    file.createWriteStream( optionsStream ),
                    err => {
                        if (err) {
                            return reject( err );
                        } else {
                            resolve( nomeArquivoDestinoFinal );
                        }
                    }
                );
            });
        }

        /**
         * Exclui um arquivo no GCS. Recebe o nome completo do arquivo.
         * Exemplo: se for exclui a logo da empresa de ID 123, o nomeDoArquivo
         * será: empresa/123/logo.jpg
         * 
         * @param {String} nomeDoArquivo nome completo do arquivo a ser excluído
         */
        deletaArquivo ( nomeDoArquivo ) {
            return new Promise( ( resolve, reject ) => {
                this.bucket.file( nomeDoArquivo ).delete().then( result => {
                    resolve( );
                }).catch( erro => {
                    reject( erro );
                });
            });
        }

        /**
         * Faz o download de um arquivo GCS para o disco do servidor
         * OBS: não está em uso
         * @param {String} pasta pasta local onde o arquivo será salvo
         * @param {String} nomeDoArquivo nome do arquivo remoto que será baixado
         */
        getArquivo ( pasta, nomeDoArquivo ) {
            return new Promise( ( resolve, reject ) => {
                const options = {
                    destination: pasta // pasta local onde o arquivo será salvo
                  };
                this.bucket.file( nomeDoArquivo ).download(options)
                .then( result => {
                    resolve( );
                }).catch( erro => {
                    reject( erro );
                });
            });
        }
    }

    module.exports = new GoogleStorage();
}
