
/*
 *  para abrir arquivos, inicialmente arquivos de impressão do prontuário
 */

;(function () {
    "use strict";

    let express = require('express'),
        router = express.Router(),
        auth = require("../autenticacao.js"),
        fs = require('fs'),
        mime = require('mime'),
        path = require('path'),
        uuid = require('uuid/v4'),
        _ = require('underscore'),
        Usuario = require('src/controller/conta/usuario').Usuario,
        Empresa = require('src/controller/conta/empresa').Empresa,
        atendimento = require('src/controller/atendimento/atendimento'),
        validacaoAtendimento = require('src/controller/atendimento/atendimento-validacao'),
        multerStorageGoogle = require('src/lib/storage/multerGoogleStorage'),
        storage = require('src/lib/storage/googleStorage'),
        multer = require('multer'),
        log = require('src/util/logInterno');
    
    const { pipeline } = require('stream');
        
            
    /**
     * Baixa o prontuário em PDF para impressão. Esse PDF foi gerado segundos
     * antes em uma requisição websocket
     */
    router.get('/prontuario/:arquivo', auth.logado, (req, res) => {
        // let file = './temp/' + req.params.arquivo;
        let file = '/home/bsbinfor/app/temp/' + req.params.arquivo;
        let mimetype = mime.getType(file);
        if( mimetype != 'application/pdf') {
            return res.status(404).send('Arquivo não encontrado');
        }

        res.set('Content-disposition', 'filename=prontuario-para-impressao.pdf');
        res.set('Content-type', mimetype);

        pipeline(
            fs.createReadStream(file),
            res,
            err => {
                if (err) {
                    return;
                } else {
                    // fs.unlink( file , (err) => {}); // o arquivo foi enviado com sucesso, mesmo assim estou achando melhor não excluir, para dá ao usuário a possibilidade de abrir o arquivo em uma janela do navegador
                }
            }
        );
    });  

    // ======================= UPLOAD =====================
    
    const multerStorageDisk = multer.diskStorage({
        destination: (req, file, cb) => {
          cb(null, 'temp/');
        },
        filename: (req, file, cb) => {
            cb(null, uuid()+'.'+mime.getExtension(file.mimetype));
        }
    });

    const multerStorageGoogleEmpresa = new multerStorageGoogle({
        destination: (req, file, cb) => {
            let user = req.user || {};
            let destino = storage.getPastaProntuario(user.empresa_id, user.id );
            cb(null, destino );
        },
        filename: (req, file, cb) => {
            let extension = '.' + mime.getExtension(file.mimetype);
            
            if ( extension == '.bin' && path.extname(file.originalname) == '.docx' ) {
                extension = '.docx';
            }
            if ( extension == '.bin' && path.extname(file.originalname) == '.doc' ) {
                extension = '.doc';
            }
            if ( extension == '.bin' && path.extname(file.originalname) == '.xls' ) {
                extension = '.xls';
            }
            if ( extension == '.bin' && path.extname(file.originalname) == '.xlsx' ) {
                extension = '.xlsx';
            }
            if ( extension == '.bin' && path.extname(file.originalname) == '.csv' ) {
                extension = '.csv';
            }
            if ( extension == '.bin' && path.extname(file.originalname) == '.odt' ) {
                extension = '.odt';
            }
            if ( extension == '.qt' && path.extname(file.originalname) == '.mov' ) {
                extension = '.mov';
            }
            if ( extension == '.ogv' && path.extname(file.originalname) == '.ogg' ) {
                extension = '.ogg';
            }
            if ( extension == '.mpga' && path.extname(file.originalname) == '.mp3' ) {
                extension = '.mp3';
            }
            if ( extension == '.null' && path.extname(file.originalname) ) {
                extension = path.extname(file.originalname);
            }

            cb(null, uuid()+ extension );
        },
        googleStorage: storage
    });

    const uploadLogoEmpresa = multer({
        storage: multerStorageDisk,
        limits: {
            fileSize: 200 * 1024 // Máximo file size is 200KB
        }, 
        fileFilter: function(req, file, cb) {
            let mines = ['image/jpeg', 'image/jpg', 'image/png'];
            if (mines.indexOf(file.mimetype) > -1 ) return cb( null, true );
            cb( 'Tipo de arquivo não permitido');
        }
    }).single('file');

    const uploadImagemPerfilUsuario = multer({
        storage: multerStorageDisk,
        limits: {
            fileSize: 100 * 1024 // Máximo file size is 100KB
        }, 
        fileFilter: function(req, file, cb) {
            let mines = ['image/jpeg', 'image/jpg', 'image/png'];
            cb(null, (mines.indexOf(file.mimetype) > -1 ));
        }
    }).single('file');

    const uploadImagemAnexoPronturio = multer({
        storage: multerStorageGoogleEmpresa,
        limits: {
            fileSize: 1024 * 1024 * 30 // Máximo file size is 30 MB
        }, 
        fileFilter: function(req, file, cb) {
            let mimesAceitos = ['image/jpeg', 'image/jpg', 'image/png', 'image/bmp', 'image/webp', 'application/pdf', 'application/msword', 'text/plain', 'video/mp4', 
            'video/mpeg', ',	video/ogg', 'video/webm', 'video/x-ms-wmv', 'video/avi', 'video/quicktime', 'video/ogg', 'audio/wav', 'audio/mpeg3', 'audio/mpeg', 
            'audio/mp3', 'audio/x-mpeg-3', 'application/rtf', 'application/vnd.ms-excel', 'text/csv', 'text/xml', 'application/vnd.oasis.opendocument.text',
            'audio/ogg'];


            let mimetype = file.mimetype;

            if( file.mimetype === 'application/octet-stream' && path.extname(file.originalname) === '.docx' ) {
                mimetype = 'application/msword';
            }
            if( file.mimetype === 'application/octet-stream' && path.extname(file.originalname) === '.doc' ) {
                mimetype = 'application/msword';
            }
            if( file.mimetype === 'application/octet-stream' && ( path.extname(file.originalname) === '.xls' || path.extname(file.originalname) === '.xlsx' ) ) {
                mimetype = 'application/vnd.ms-excel';
            }
            if( file.mimetype === 'application/octet-stream' && path.extname(file.originalname) === '.csv' ) {
                mimetype = 'text/csv';
            }
            if( file.mimetype === 'application/octet-stream' && path.extname(file.originalname) === '.odt' ) {
                mimetype = 'application/vnd.oasis.opendocument.text';
            }
            if( file.mimetype === 'application/octet-stream' && path.extname(file.originalname) === '.rtf' ) {
                mimetype = 'application/rtf';
            }
            file.mimetype = mimetype;
            cb(null, (mimesAceitos.indexOf(mimetype) > -1 ));
        }
    }).single('file');
    
     
    /**
     * Altera a logo da empresa
     */
    router.post('/upload/logo-empresa', auth.logado, auth.empresaAssinante, (req, res) => {
        // salva o arquivo temporariamente no disco do servidor
        uploadLogoEmpresa( req, res, ( err ) => {
            if ( err ) {
                let erro = 'erro desconhecido ao processar arquivo';
                if( err instanceof multer.MulterError ) {
                    erro = 'Arquivo inválido';
                    if( err.code == 'LIMIT_FILE_SIZE') {
                        erro = 'Arquivo muito grande, o máximo permitido é 200KB';
                    }
                }

                if ( _.isString( err) ) {
                    erro = err;
                }

                return res.json({status: false, erro: erro });
            }

            if ( !req.file ) {
                return res.json({status: false, erro: 'Arquivo não enviado' });
            }
            
            // envia o arquivo salvo no disco para a empresa gravar seu nome no banco
            // e depois enviar para o google storage
            Empresa.alteraLogo( req.user.empresa_id, req.user, req.file.path ).then( ( novoNomeArquivo ) => {
                res.json({status: true, arquivo: novoNomeArquivo });
            }).catch( erro => {
                res.json({status: false, erro: erro});
            });
        });
    });
    
     
    /**
     * Envia a imagem de perfil do usuário
     */
    router.post('/upload/perfil-usuario', auth.logado, auth.empresaAssinante, (req, res) => {
        uploadImagemPerfilUsuario( req, res, ( err ) => {
            if ( err ) {
                let erro = 'erro desconhecido ao processar arquivo';
                if( err instanceof multer.MulterError ) {
                    erro = 'Arquivo inválido';
                    if( err.code == 'LIMIT_FILE_SIZE') {
                        erro = 'Arquivo muito grande, o máximo permitido é 100KB';
                    }
                }

                if ( _.isString( err) ) {
                    erro = err;
                }

                return res.json({status: false, erro: erro });
            }

            if ( !req.file ) {
                return res.json({status: false, erro: 'Arquivo não enviado' });
            }

            Usuario.alteraImagemPerfil( req.user.empresa_id, req.user, req.body.usuarioID, req.file.path ).then( ( novoNomeArquivo ) => {
                res.json({status: true, arquivo: novoNomeArquivo });
            }).catch( erro => {
                res.json({status: false, erro: erro});
            });
        });
    });

    router.post('/upload/prontuario-anexo', auth.logado, validacaoAtendimento.validaAnexosEtapaDoisExpress, (req, res) => {
        uploadImagemAnexoPronturio( req, res, ( err ) => {
            if ( err ) {
                let erro = 'erro desconhecido ao processar arquivo';
                if( err instanceof multer.MulterError ) {
                    erro = 'Arquivo inválido';
                    if( err.code == 'LIMIT_FILE_SIZE') {
                        erro = 'Arquivo muito grande, o máximo permitido é 30MB';
                    }
                }

                if ( _.isString( err) ) {
                    erro = err;
                }

                // erro emitido pelo MulterGoogleStorage
                if ( err.erroUsuario ) {
                    erro = err.erroUsuario;
                }

                log.registraErro( err.erroInterno || err, 'arquivo,upload', 'Arquivo: src/web/routes/arquivo.js');

                return res.json({status: false, erro: erro });
            }

            if ( !req.file ) {
                return res.status(200).json({status: false, erro: 'Arquivo não enviado' });
            }

            const Atendimento = new atendimento( req.user );
            let dados = req.dados;
            dados.size = req.file.size;

            Atendimento.enviaArquivosEtapaDois( dados, req.file.filename, req.file.path )
            .then( ( ) => {
                res.json({status: true, arquivo: req.file.filename });
            })
            .catch( erro => {
                res.json({status: false, erro: erro});
            });
        });
    });

    /**
     * Regra para visualizar imagens:
     * Somente empresas assinantes e com o plano ativo
     * Se não for assinante, retorna uma imagem padrão OU erro 404 
     * (imagem não encontrada)
     */

     /**
      * Retorna a imagem de perfil de um usuário X
      */
    router.get('/img/perfil-usuario/:usuarioID/:imagem', auth.logado, ( req, res ) => {
        let pastaDestino = storage.getPastaUsuario( req.user.empresa_id, req.params.usuarioID );
        let arquivo = `${pastaDestino}/${req.params.imagem}`;
        visualizarImagem( arquivo, res );
    });

    router.get('/img/logo-empresa/:imagem', auth.logado, ( req, res ) => {
        let pastaDestino = storage.getPastaEmpresa( req.user.empresa_id );
        let arquivo = `${pastaDestino}/${req.params.imagem}`;
        visualizarImagem( arquivo, res );
    });

    router.get('/img/logo-empresa-cdn/:empresaID/:imagem', auth.authCDN, ( req, res ) => {
        let empresaID = parseInt( req.params.empresaID );
        
        if( !_.isNumber( empresaID ) ) {
            return res.status(400).send('Requisição inválida');
        }
        if( empresaID <= 0 ) {
            return res.status(400).send('Requisição inválida');
        }

        let pastaDestino = storage.getPastaEmpresa( empresaID );
        let arquivo = `${pastaDestino}/${req.params.imagem}`;
        
        visualizarImagem( arquivo, res );
    });

    router.get('/img/prontuario-anexo/:imagem', auth.logado, ( req, res ) => {
        let pastaDestino = storage.getPastaProntuario( req.user.empresa_id, req.user.id );
        let arquivo = `${pastaDestino}/${req.params.imagem}`;
        visualizarImagem( arquivo, res );
    });

    /**
     * Para acessar via CDN (cloudimg.io)
     * Dessa forma a autenticação não é a mesma e nem a passagem dos parametros
     * @param {Integer} userID PK do usuário (profissional)
     */
    router.get('/img/prontuario-anexo-cdn/:empresaID/:userID/:imagem', auth.authCDN, ( req, res ) => {
        let empresaID = parseInt( req.params.empresaID );
        let userID = parseInt( req.params.userID );
        
        if( !_.isNumber( empresaID ) || !_.isNumber (userID) ) {
            return res.status(400).send('Requisição inválida');
        }
        if( empresaID <= 0 || userID <= 0 ) {
            return res.status(400).send('Requisição inválida');
        }

        let pastaDestino = storage.getPastaProntuario( empresaID, userID );
        let arquivo = `${pastaDestino}/${req.params.imagem}`;
        
        visualizarImagem( arquivo, res );
    });

    function visualizarImagem( arquivo, res ) {
        let remoteFile = storage.getBucket().file( arquivo );
        // 1º pega os metadados
        remoteFile.getMetadata().then( data => {
            if(data[0].contentType) res.set('Content-Type', data[0].contentType);
            else                    res.set('Content-Type', 'image/jpeg');
            if(data[0].size)        res.set('Content-Length', data[0].size);
            if(data[0].etag)        res.set('ETag', data[0].etag);
            if(data[0].updated)     res.set('Last-Modified', data[0].updated);

            pipeline(
                remoteFile.createReadStream(),
                res,
                err => {
                    if (err) {
                        // Dá erro quando uso res.send, pois essa função não pode ser chamada duas vezes e ao passar res no pipe acima é isso que acontece
                        // let msg = 'Não foi possível acessar a imagem';
                        // if( err.code == 404 ) msg = 'O arquivo não existe';
                        // res.send( msg );
                        return;
                    }
                }
            );
        }).catch( erro => {
            if( erro.code == 404 ) {
                res.status( 404).send('Not found');
                return;
            }
            res.send( 'Erro ao localizar imagem' );
        });
    }

    module.exports = router;
}());