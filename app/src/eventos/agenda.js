;(function () {
    "use strict";

    /**
     * Eventos relacionados a agenda
     */

    const 
    prefixo = 'agenda.',
    ouvinte = require('src/eventos/eventosInternos'),
    constant = require('src/util/constant.js'),
    io = ouvinte.getSocket(),
    mysql = require('src/util/conexoes.js');

    ouvinte
    .on( prefixo + 'novo', add )
    .on( prefixo + 'edit', edit )
    .on( prefixo + 'mudaStatusAtendimento', mudaStatusAtendimento )
    .on( prefixo + 'mudaPreferenciaProfissional', mudaPreferenciaProfissional )
    .on( prefixo + 'informaPagamento', informaPagamento )
    .on( prefixo + 'ordenarAgendaDia', ordenarAgendaDia )
    ;

    function add( empresaID, data, atendimentoID, profissionalID, clienteID, servicoID ) {
        io.of(constant.WS_NSP_CLIENTE).to('empresa.'+empresaID).emit(`${prefixo}novo`, data, atendimentoID, profissionalID);// para agenda do dia
        io.of(constant.WS_NSP_CLIENTE).to('empresa.'+empresaID).emit(`${prefixo}novo2`, data, atendimentoID, profissionalID, clienteID, servicoID);// para a listagem de atendimentos
    }

    function edit( empresaID, atendimentoID, dados ) {
        if(dados.convenioID) {
            mysql.query('SELECT nome FROM convenio WHERE empresa_id = ? AND id = ?', [empresaID, dados.convenioID], function(err, result){
                if(!err && result ) {
                    if(result.length > 0) dados.convenio_nome = result[0].nome;
                }
                io.of(constant.WS_NSP_CLIENTE).to('empresa.'+empresaID).emit(`${prefixo}edit`, atendimentoID, dados);
            });
        }else 
            io.of(constant.WS_NSP_CLIENTE).to('empresa.'+empresaID).emit(`${prefixo}edit`, atendimentoID, dados);
    }

    function mudaStatusAtendimento( empresaID, atendimentoID, status ) {
        io.of(constant.WS_NSP_CLIENTE).to('empresa.'+empresaID).emit(`${prefixo}mudaStatusAtendimento`, atendimentoID, status);
    }

    function mudaPreferenciaProfissional( empresaID, atendimentoID, status ) {
        io.of(constant.WS_NSP_CLIENTE).to('empresa.'+empresaID).emit(`${prefixo}mudaPreferenciaProfissional`, atendimentoID, status);
    }

    function informaPagamento( empresaID, atendimentoID, dados ) {
        io.of(constant.WS_NSP_CLIENTE).to('empresa.'+empresaID).emit(`${prefixo}informaPagamento`, atendimentoID, dados);
    }

    function ordenarAgendaDia( empresaID, agendaID, ordens ) {
        io.of(constant.WS_NSP_CLIENTE).to('empresa.'+empresaID).emit(`${prefixo}ordenarAgendaDia`, agendaID, ordens);
    }

}());