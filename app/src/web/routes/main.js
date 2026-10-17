
/*
 *  Controlador principal
 */

;(function () {
    "use strict";
    
    const express = require('express'),
        router = express.Router(),
        Empresa = require("src/controller/conta/empresa.js").Empresa,
        Usuario = require("src/controller/conta/usuario.js").Usuario,
        Autenticacao = require("src/controller/conta/autenticacao.js").Autenticacao,
        Facebook = require("src/controller/conta/auth-facebook.js");

    /*
     * Faz o cadastro
     */
    router.post('/cadastro', function(req, res) {
        Empresa.cadastra(req.body).then(function(){
            res.json({status: true});
        }).catch(function(err){
            res.json({status: false, reason: err});
        });
    });
    
    /*
     * Ativa o cadastro da empresa
     */
    router.post('/ativar-cadastro', function(req, res) {
        Empresa.ativaCadastro(req.body.token || null).then(function(info){
            res.json({status: true, code: info});
        }).catch(function(err){
            res.json({status: false, erros: err});
        });
    });
    
    /*
     * O cliente solicita que seja enviado um link para ativação do seu cadastro
     * Esse link aparece quando há uma tentativa de login e é detectado que essa
     * empresa esta "não validada"
     */
    router.post('/solicita-link-ativacao', function(req, res) {
        Empresa.solicitaLinkAtivacao(req.body.email, req.body.senha, req.body.usuarioID, req.body.empresaID ).then(function(){
            res.json({status: true});
        }).catch(function(err){
            res.json({status: false, erros: err});
        });
    });

    //////////////////////////////  NOVA FORMA DE LOGIN EM 2 ETAPAS
    /**
     * O login em 2 etapas é feito enviando apenas o e-mail na 1º etapa,
     * e na segunda etapa é enviado a senha, e a empresa na qual o usuário deseja
     * se logar. Se o usuário tiver mais
     */
    /**
     * 1º etapa do login
     * Etapa 1 / 2
     */
    router.post('/identifique-se', function(req, res) {
        Autenticacao.idetificar( req.body.email ).then(function( result ){
            res.json({status: true, result: result });
        }).catch(function(err){
            res.json({status: false, erro: err});
        });
    });

    /**
     * Etapa 2 / 2
     * É nessa etapa que o usuário informa senha e seleciona a empresa que e o
     * usuário que estará fazendo login
     * 
     * @param {string} email login do usuário
     * @param {string} senha senha do usuário
     * @param {string} usuarioID md5 do ID do usuário
     */
    router.post('/entrar', function(req, res) {
        let dados = req.body || {};
        dados.userAgent = req.headers['user-agent'];
        dados.origin = req.headers.origin;

        Autenticacao.entrar( dados ).then(function( token ){
            res.json({status: true, token: token });
        }).catch(function(err){
            res.json({status: false, erro: err});
        });
    });
    //////////////////////////////  fim NOVA FORMA DE LOGIN EM 2 ETAPAS

    /*
     * Faz o logout
     */
    router.get('/logout', function(req, res) {
        Autenticacao.logout(req.body);
        res.send("ok");
    });
    
    /*
     * Solicita a recuperação da senha, se o e-mail informado estiver correto,
     * será enviado um link para a redefinição da senha
     */
    router.post('/recupera-senha', function(req, res) {
        Usuario.recuperaSenha( req.body ).then(function(){
            res.json({status: true});
        }).catch(function(err){
            res.json({status: false, erros: err});
        });
    });
    
    /*
     * Redefine a senha. É submetido a partir do formulário que foi enviado para
     * o e-mail. O token é o código que foi enviado para o e-mail
     */
    router.post('/redefinir-senha', function(req, res) {
        Usuario.redefineSenha(req.body.token || null, req.body.check || null, req.body.senha || null, req.body.senha2 || null).then(function(){
            res.json({status: true});
        }).catch(function(err){
            res.json({status: false, erros: err});
        });
    });
    

    // ========== LOGIN / CADASTRO FACEBOOK
    /*
     * Login ou cadastro com o facebook
     */
    router.post('/identifique-se-facebook', function(req, res) {           
        Facebook.identificar( req.body ).then( result => {
            res.json({status: true, result: result });
        }).catch( erro => {
            res.json({status: false, erros: erro });
        });
    });
    // ========== fim LOGIN / CADASTRO FACEBOOK

    router.get('/ping', function(req, res) {
        res.send("pong");
    });

    module.exports = router;
}());