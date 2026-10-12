;(function () {
    "use strict";

    /**
     * Eventos relacionados aos profisionais da empresa
     */

    const 
    prefixo = 'profissional.',
    ouvinte = require('src/eventos/eventosInternos'),
    constant = require('src/util/constant.js'),
    io = ouvinte.getSocket();

    ouvinte
    .on( prefixo + 'add', add )
    .on( prefixo + 'edit', edit )
    .on( prefixo + 'del', del )
    .on( prefixo + 'editHorario', editHorario )
    .on( prefixo + 'editConvenio', editConvenio )
    .on( prefixo + 'editServico', editServico )
    ;

    function add( empresaID, medicoID ) {
        io.of(constant.WS_NSP_CLIENTE).to('empresa.'+empresaID).emit('medico.add', medicoID);
    }

    function edit( empresaID, medicoID, dados ) {
        io.of(constant.WS_NSP_CLIENTE).to('empresa.'+empresaID).emit('medico.edit', medicoID, dados);
    }

    function del( empresaID, profissionalID ) {
        io.of(constant.WS_NSP_CLIENTE).to('empresa.'+empresaID).emit('medico.del', profissionalID);
    }

    function editHorario( empresaID, profissionalID, horarios ) {
        io.of(constant.WS_NSP_CLIENTE).to('empresa.'+empresaID).emit('medico.editHorario', profissionalID, horarios);
    }

    function editConvenio( empresaID, profissionalID, dados ) {
        io.of(constant.WS_NSP_CLIENTE).to('empresa.'+empresaID).emit('medico.editConvenio', profissionalID, dados);
    }

    function editServico( empresaID, profissionalID, dados ) {
        io.of(constant.WS_NSP_CLIENTE).to('empresa.'+empresaID).emit('medico.editServico', profissionalID, dados);
    }
}());