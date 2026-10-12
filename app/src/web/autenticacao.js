/**
 * Usado para checar os clientes, não a administração interna do 99Clinic
 */
;(function () {
    "use strict";
    const Login = require("src/controller/conta/autenticacao.js").Autenticacao,
    assinaturaUtil = require('src/controller/assinatura/assinatura-util').AssinaturaUtil,
    conf = require('src/util/config');
    
    function logado(req, res, next) {
        let token = req.query.token;
        let userAgent = req.headers['user-agent'];
        let origin = req.get('origin');// req.headers.origin;

        // se o token não tiver a query, tenta encontrar no body
        if( !token || token == undefined ) {
            token = req.body.token;
        }

        if (typeof token !== 'undefined') {
            Login.apertoDeMao( token, userAgent, origin ).then(function (user) {
                if (user) {
                    user.token = token;
                    req.user = user;
                    next();
                } else {
                    res.sendStatus(401);
                }
            }).catch(function (erro) {
                res.sendStatus(401);
            });
        } else {
            res.sendStatus(401);
        }
    }

    // apenas administradores da conta (empresas,clinicas)
    function soAdmin(req, res, next) {
        let user = req.user;
        if (typeof user !== 'undefined') {
            if (user.perfil === 'a') {
                next();
            } else {
                // res.sendStatus(403);
                res.send('Você não tem permissão');
            }
        } else {
            res.sendStatus(403);
        }
    }

    // apenas para administradores e profissionais
    function soAdminOuProfissional(req, res, next) {
        let user = req.user;
        if (typeof user !== 'undefined') {
            if (user.perfil === 'a' || user.perfil === 'p') {
                next();
            } else {
                // res.sendStatus(403);
                res.send('Você não tem permissão');
            }
        } else {
            res.sendStatus(403);
        }
    }

    // apenas para profissionais
    function soProfissional(req, res, next) {
        let user = req.user;
        if (typeof user !== 'undefined') {
            if ( user.perfil === 'p' ) {
                next();
            } else {
                // res.sendStatus(403);
                res.send('Você não tem permissão');
            }
        } else {
            res.sendStatus(403);
        }
    }

    // verifica se a empresa assinou o plano PRÓ
    // se a requisição for feita por um profissional, checa se o mesmo tem o plano pró
    function assinante(req, res, next) {
        let user = req.user;
        
        if (typeof user === 'undefined') {
            return res.sendStatus(403);
        }

        assinaturaUtil.getCacheAssinatura( user.empresa_id )
            .then( assinatura => {
                if( assinatura.plano != 'pró' ) {
                    return res.send('Recurso disponível apenas para assinantes');
                }

                if(assinatura.status == '4') { // conta bloqueada
                    return res.send('conta bloqueada');
                }
                if( assinatura.profissional == 'todos') return next(); // ativo para todos os profissionais

                // se o usuário for profissional, verifica se o mesmo tem ou não o plano pró ativo
                if( !assinatura.profissionais.includes( user.profissional_id ) && user.perfil == 'p' ) { // não esta ativo para esse profissional
                    return res.send('Recurso disponível apenas para assinantes');
                }
                next();
            })
            .catch( erro => {
                res.send('Erro interno');
            });
    }

    /**
     * verifica se a empresa assinou o plano PRÓ
     * diferente da função "assinante", considera apenas a empresa e pronto
     */
    function empresaAssinante(req, res, next) {
        let user = req.user;
        
        if (typeof user === 'undefined') {
            return res.sendStatus(403);
        }

        assinaturaUtil.getCacheAssinatura( user.empresa_id )
            .then( assinatura => {
                if( assinatura.plano != 'pró' ) {
                    return res.status(403).send('Recurso disponível apenas para assinantes');
                }

                if(assinatura.status == '4') { // conta bloqueada
                    return res.status(403).json('sua conta esta bloqueada');
                }
      
                next();
            })
            .catch( erro => {
                res.send('Erro interno');
            });
    }

    /**
     * Verifica se o cloudimg.io passou o header auth-cdn
     * 
     * O valor de auth-cdn é definido via variavel de ambiente
     */
    function authCDN(req, res, next) {
        let token = req.headers['auth-cdn'];

        // se o token não tiver a query, tenta encontrar no body
        if( !token || token == undefined || !conf.authImgCdn ) {
            return res.sendStatus( 401 );
        }

        if( token != conf.authImgCdn ) {
            return res.sendStatus( 401 );
        }

        next();
    }


    exports.logado = logado;
    exports.authCDN = authCDN;
    exports.soAdmin = soAdmin;
    exports.soAdminOuProfissional = soAdminOuProfissional;
    exports.soProfissional = soProfissional;
    exports.assinante = assinante;
    exports.empresaAssinante = empresaAssinante;
}());