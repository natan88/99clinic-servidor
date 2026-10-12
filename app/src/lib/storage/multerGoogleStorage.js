/**
 * Storage Multer para salvar os arquivos diretamente no Google Cloud Storage
 * Não passa pelo disco
 */
{
    "use strict";

    const { pipeline } = require('stream'),
    uuid = require('uuid/v4'),
    mime = require('mime');

    class MulterGoogleStorage {
        constructor ( opts ) {
            this.bucket = opts.googleStorage.getBucket();

            this.filename = ( opts.filename || this.filenamePadrao);
            this.destino = ( opts.destination || this.destinoPadrao);
        }

        destinoPadrao ( req, file, cb ) {
            cb( null, `temp` );
        }

        filenamePadrao ( req, file, cb ) {
            cb(null, uuid()+'.'+mime.getExtension( file.mimetype ));
        }


        /**
         * Processa o arquivo. Estou enviando direto para o google storage
         */
        _handleFile ( req, file, cb ) {
            let nomeArquivoDestino = null;
            let pastaDestino;

            // pega o nome que o arquivo deve ter no google storage
            this.filename( req, file, ( err, name ) => {
                nomeArquivoDestino = name ? name : file.originalname;
            });

            this.destino( req, file, ( err, destino ) => {
                pastaDestino = destino;
            });

            const optionsStream = {
                metadata: {
                    contentType: file.mimetype
                }
            };

            const arquivo = this.bucket.file( `${pastaDestino}/${nomeArquivoDestino}` );

            let fileStream = file.stream;
            let size = 0;

            // conta o tamanho dos dados recebidos
            fileStream.on('data', (chunk) => {
                size += chunk.length;
            });

            // canaliza as partes recebidas para o google storage
            pipeline(
                fileStream,
                arquivo.createWriteStream( optionsStream ),
                err => {
                    if (err) {
                        return cb( { erroInterno: err, erroUsuario: `Erro ao gravar dados no servidor` }, null );
                    } else {
                        cb( null, {
                            path: `${pastaDestino}/${nomeArquivoDestino}`,
                            size: size,
                            filename: nomeArquivoDestino
                        });
                    }
                }
            );
        }

        /**
         * estou enviando o resultado
         */
        _removeFile ( req, file, cb ) {
            this.bucket.file( file.path ).delete().then( result => {
                cb();
            }).catch( erro => {
                cb( erro, null );
            });
        }
    }

    module.exports = MulterGoogleStorage;
}
