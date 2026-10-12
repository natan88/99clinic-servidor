/*
 * Controlador das ações do usuario
 */

/* global exports, module, __base, require */

;(function () {
    "use strict";

    const Login = require("src/controller/conta/autenticacao.js").Autenticacao,
        Usuario = require("src/controller/conta/usuario.js").Usuario,
        UsuariosOnline = require('src/util/usuariosOnline.js');
        
    function Controller(socket) {
        const self = this;
        
        /* ----------------------- SALAS -----------------------*/
        socket.join('user.'+socket.user.id);// minha sala particular
        socket.leave(socket.id);// saiu da minha sala exclusiva (que o próprio socket.io cria para mim, não há necessidade pois tenho a sala acima
        
        socket.join('empresa.'+socket.user.empresa_id);// entrei na sala da empresa

        // se for admin, entra na sala dos administradores
        if( socket.user.perfil == 'a') {
            socket.join('empresa-admin.'+socket.user.empresa_id);// a sala
        }
        
        
        /*
         * Retorna todos os usuários do sistema (funcionários da empresa). Não retorna clientes
         * Para todos, já que haverá conversa entre usuários
         */
        socket.on('usuario.getUsuarios', function(fn) {
            if( !fn ) return;
            Usuario.getUsers(socket.user.empresa_id).then(function(user){
               fn({status: true, result: user});
            }).catch(function(){
                fn({status: false});
            });
        });
        
        socket.on('usuario.add', function(dados, fn) {
            if( !fn ) return;
            Usuario.addUser(socket.user.empresa_id, socket.user, dados).then(function(id){
               fn({status: true, id: id});
            }).catch(function(erros){
                fn({status: false, erros: erros});
            });
        });
        
        socket.on('usuario.edit', function(dados, fn) {
            if( !fn ) return;
            Usuario.editUser(socket.user.empresa_id, socket.user, dados).then(function(){
               fn({status: true});
            }).catch(function(erros){
                fn({status: false, erros: erros});
            });
        });
        
        socket.on('usuario.editSenha', function(userID, senha, fn) {
            if( !fn ) return;
            Usuario.editSenhaUser(socket.user.empresa_id, socket.user.perfil, userID, senha).then(function(){
               fn({status: true});
            }).catch(function(erros){
                fn({status: false, erros: erros});
            });
        });
        
        socket.on('usuario.solicitacaoSobreSenha', function(userID, acao, fn) {
            if( !fn ) return;
            Usuario.solicitacaoSobreSenhaUsuario(socket.user.empresa_id, socket.user, userID, acao).then(function(){
               fn({status: true});
            }).catch(function(erros){
                fn({status: false, erros: erros});
            });
        });

        /**
         * Remove a imagem do perfil de um usuário
         * O ADM pode remover imagem de qualquer usuário
         * Os demais usuários podem remover apenas sua própria imagem
         * 
         * @param {Integer} usuarioID PK do usuário que terá a imagem removida
         */
        socket.on('usuario.removeImagemPerfil', ( usuarioID, fn) => {
            if( !fn ) return;
            Usuario.removeImagemPerfil( socket.user.empresa_id, socket.user, usuarioID ).then( () => {
               fn({status: true});
            }).catch( (erros) => {
                fn({status: false, erros: erros});
            });
        });
        
        socket.on('usuario.del', function(id, fn) {
            if( !fn ) return;
            Usuario.delUser(socket.user.empresa_id, id, socket.user.perfil, socket.user.id).then(function(){
               fn({status: true});
            }).catch(function(erros){
                fn({status: false, erro: erros});
            });
        });
        
        socket.on('usuario.getOnline', (fn) => {
            if( !fn ) return;
            UsuariosOnline.getUsuariosOnline( socket.user.empresa_id )
            .then( (usuarios) => {
                fn( usuarios );
            });
        });
        
        /*------------------------------ MEUS DADOS --------------------------*/
               
        /*
         * solicita os dados do proprio usuario
         * retornar os dados para o cliente que fez a solicitação
         */
        socket.on('me.get', function(fn) {
            if( !fn ) return;
            Usuario.getMe(socket.user.empresa_id, socket.user.id).then(function(user){
               fn({status: true, result: user});
            }).catch(function(){
                fn({status: false});
            });
        });
        
        /*
         * Altera a senha
         */
        socket.on('me.editSenha', function(senha, fn) {
            if( !fn ) return;
            Usuario.meEditSenha(socket.user.empresa_id, socket.user.id, senha).then(function(){
               fn({status: true});
            }).catch(function(erro){
                fn({status: false, erros: erro});
            });
        });
        
        /*
         * Altera dados básicos
         */
        socket.on('me.edit', function(dados, fn) {
            if( !fn ) return;
            Usuario.meEdit(socket.user.empresa_id, socket.user, dados).then(function(){
               fn({status: true});
            }).catch(function(erro){
                fn({status: false, erros: erro});
            });
        });

        /*
         * faz logout
         */
        socket.on('logout', function() {
            Login.logout(socket.user.id, socket.user.empresa_id, socket.user.token);
            socket.disconnect();
        });        
    }// controller


    exports.controller = Controller;
}());