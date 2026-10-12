/*
 * Área do nosso cliente
 */

;(function () {
    "use strict";

    const
        login = require("./apertoDeMao.js"),
        autenticacao = require("src/controller/conta/autenticacao.js").Autenticacao,
        evento = require('src/eventos/eventosInternos'),
        constant = require('src/util/constant.js'),
        UsuariosOnline = require('src/util/usuariosOnline.js'),
        controleUser = require('./controllers/usuario.js'),
        controleEmpresa = require('./controllers/empresa.js'),
        controleConvenio = require('./controllers/convenio.js'),
        controleServico = require('./controllers/servico.js'),
        controleProfissional = require('./controllers/profissional.js'),
        controleCliente = require('./controllers/cliente.js'),
        controleAgenda = require('./controllers/agenda.js'),
        controleFinanceiro = require('./controllers/financeiro.js'),
        controleImportar = require('./controllers/importar.js'),
        controleUtil = require('./controllers/util.js'),
        controleProntuario = require('./controllers/prontuario.js'),
        controleAtendimento = require('./controllers/atendimento.js'),
        controleAssinatura = require('./controllers/assinatura.js'),
        controleImpressao = require('./controllers/impressao.js');
        
    function Clientes(sio) {
        if (!sio) return;
        
        let app = sio.of(constant.WS_NSP_CLIENTE);
        app.use(login.apertoDeMao);

        app.on('connection', (socket) => {
            controleUser.controller(socket);
            controleEmpresa.controller(socket);  
            controleConvenio.controller(socket);  
            controleServico.controller(socket);  
            controleProfissional.controller(socket);  
            controleCliente.controller(socket);  
            controleAgenda.controller(socket);  
            controleFinanceiro.controller(socket);
            controleImportar.controller(socket);
            controleUtil.controller(socket);
            controleProntuario.controller(socket);
            controleAtendimento.controller(socket);
            controleAssinatura.controller(socket);
            controleImpressao.controller(socket);


            // controle de usuários online / offline
            UsuariosOnline.setOnline( socket.user.empresa_id, socket.user.id );
            evento.emit('usuario.entrou', socket.user.empresa_id, socket.user.id, socket.user.perfil );

            socket.on('disconnect', () => {
                evento.emit('usuario.saiu', socket.user.empresa_id, socket.user.id, socket.user.perfil );
                UsuariosOnline.setOffline( socket.user.empresa_id, socket.user.id );
                autenticacao.fimSessao( socket.user.sessaoID );
            });

            // 
            /**
             * middleware executado em cada requisição
             * Pode ser usado para controle de acesso / permissão
             * 
             * Explicação dos dados do middleware
             * packet[0] = endpoint. Ex.: servico.edit
             * packet[1] = dados. Ex.: objeto com os dados do serviço
             * packet[2] = função de callback
             */
            socket.use((packet, next) => {
                next();
                UsuariosOnline.updateTTL( socket.user.empresa_id, socket.user.id );

                // esboço de controle de acesso
                // seria necessário que o retorno de todas as chamadas fosse padronizado, 
                // especialmente nos casos de falha

                // if( packet[0] == 'servico.edit' && socket.user.perfil != 'a' ) {
                //     packet[2]({status: false, erros: 'sem permissão'}); // verificar se a função existe
                //     return;
                // }
            });
        });

        app.on('error', (s) => { });
    }

    module.exports = Clientes;
}());