;(function () {
    "use strict";
    

    const Promise = require("promise"),
        mysql = require('src/util/conexoes.js'),
        UsuariosOnline = require('src/util/usuariosOnline.js'),
        validacao = require("./profissional-validacao"),
        async = require('async'),
        _ = require('underscore'),
        crypto = require('crypto'),
        uuid = require('uuid'),
        EnviaEmail = require("src/controller/enviaEmail.js").EnviaEmail,
        geraCodigo = require('src/util/util').codigoUnico,
        prontuario = require('src/controller/profissional/profissional_prontuario_padrao').MedicoProntuariosIniciais,
        evento = require('src/eventos/eventosInternos'),
        storage = require('src/lib/storage/googleStorage'),
        log = require('src/util/logInterno'),
        GCalendar = require('src/lib/calendario/googleCalendario.js'),
        agendaUtil = require('src/controller/agenda/agenda-util');
    
    const notificacaoProf = 'profissional.';
    let instance = null;

    function Medico() {
        const self = this;

        self.getAll = getAll;
        self.getMedico = getMedico;
        self.getMedicosDoServico = getMedicosDoServico;
        self.add = add;
        self.edit = edit;
        self.editHorario = editHorario;
        self.editConvenio = editConvenio;
        self.editServico = editServico;
        self.del = del;
        self.getUrlAutorizacaoGoogleAgenda = getUrlAutorizacaoGoogleAgenda;
        self.registraAutorizacaoGoogleAgenda = registraAutorizacaoGoogleAgenda;
        self.revogaAutorizacaoGoogleAgenda = revogaAutorizacaoGoogleAgenda;
        
        /*
         * Retorna os profissionais (médidos)
         * Para todos os usuários "administrador" e "secretária". O médico recebe
         * apenas a si mesmo
         * 
         * Os ADMINSTRADORES receberão mais dados do profissional, como o valor que ele recebe pelo serviço
         * Os demais usuários, receberão apenas os dados mínimos necessários.
         */
        function getAll ( empresaID, user ) {
            return new Promise( ( resolve, reject ) => {
                let sqlS = 'SELECT servico_id AS id, valor FROM profissional_has_servico WHERE profissional_id = ?';
                let sqlC = 'SELECT convenio_id AS id FROM profissional_has_convenio WHERE profissional_id = ?';

                // tranforma um item de array de {id: 9} em 9, ou seja, deixa de ser um objeto e passa a ser um número primário
                const processaConvenio = (item, callback) => {
                    callback(null, item.id);
                };
                
                let select = `p.id, p.nome, p.email, p.celular, p.telefone, p.ativo, p.horario, p.conselho, p.conselho_uf, 
                p.conselho_nr, p.demo, p.usuario_id, p.tratamento, p.especialidade, p.sexo, p.nota, 
                DATE_FORMAT(p.nascimento, "%Y-%m-%d") AS nascimento, p.uf, p.cidade, p.bairro, p.endereco, p.cep, p.cpf, u.foto`;

                let where = 'p.empresa_id = ?';
                let cols = [empresaID];

                // se profissional, retorna apenas a si mesmo
                if(user.perfil === 'p') {
                    where += ' AND p.usuario_id = ?';
                    cols.push( user.id );
                }

                const query = `SELECT ${select} 
                    FROM profissional p
                    LEFT JOIN usuario u ON (u.id = p.usuario_id)
                    WHERE ${where}`;
                
                mysql.query( query , cols, (err, profissionais) =>{
                    if( err || !profissionais ) return reject('Erro interno ao obter profissionais');
                    
                    async.eachSeries(profissionais, (profissional, callback)=> {
                        if(profissional.horario) profissional.horario = JSON.parse(profissional.horario);

                        async.parallel({
                            servico: (callback) =>{
                                mysql.query(sqlS, [profissional.id], (err, result) =>{
                                    if(err || result.length < 1) return callback(err);
                                    return callback(null, result);
                                });
                            },
                            convenio: (callback) => {
                                mysql.query(sqlC, [profissional.id], (err, result) => {
                                    if(err || result.length < 1) return callback(err);
                                    async.map(result, processaConvenio, (err, results) => {
                                        return callback(null, results);
                                    });
                                });
                            },
                            online: (callback) => {
                                if( !profissional.usuario_id ) return callback();
                                UsuariosOnline.estaOnline( empresaID, profissional.usuario_id )
                                .then( online => {
                                    profissional.online = online;
                                    callback();
                                }).catch( () => callback() );
                            }
                        }, (err, result) => {
                            profissional.servico = [];
                            profissional.convenio = [];
                            if(result.servico) profissional.servico = result.servico;
                            if(result.convenio) profissional.convenio = result.convenio;
                            // socket.emit('medico.new', profissional);
                            callback();
                        });
                    }, 
                    ( erro ) => {
                        if( erro ) return reject( erro );
                        resolve( profissionais );
                    });
                });
            });
        }//getAll
        
        // estudar a possibilidade de juntar essa função com getAll já que são muito parecidas
        /**
         * Retona um médico específico, se o usuário logado for um profissinal,
         * só retornar se for ele mesmo, já que ele não pode receber outros profissionais
         */
        function getMedico (empresaID, user, medicoID) {
            return new Promise( function ( resolve ){
                const sqlS = 'SELECT servico_id AS id, valor FROM profissional_has_servico WHERE profissional_id = ?';
                const sqlC = 'SELECT convenio_id AS id FROM profissional_has_convenio WHERE profissional_id = ?';

                const processaConvenio = function(item, callback) {
                    callback(null, item.id);
                };

                let select = `p.id, p.nome, p.email, p.celular, p.telefone, p.ativo, p.horario, p.conselho, p.conselho_uf, 
                p.conselho_nr, p.demo, p.usuario_id, p.tratamento, p.especialidade, p.sexo, p.nota, 
                DATE_FORMAT(p.nascimento, "%Y-%m-%d") AS nascimento, p.uf, p.cidade, p.bairro, p.endereco, p.cep, p.cpf, u.foto`;

                let where = 'p.id = ? AND p.empresa_id = ?';
                let cols = [medicoID, empresaID];

                // se profissional, retorna apenas a si mesmo
                if(user.perfil === 'p') {
                    where += ' AND p.usuario_id = ?';
                    cols.push( user.id );
                }

                const query = `SELECT ${select} 
                    FROM profissional p
                    LEFT JOIN usuario u ON (u.id = p.usuario_id)
                    WHERE ${where}`;

                mysql.query( query , cols, function(err, result){
                    if(err || !result || result.length === 0) return resolve(null);
                    let user = result[0];
                    user.horario = JSON.parse(user.horario);
                    user.servico = [];
                    user.convenio = [];

                    // busca itens relacionados
                    async.parallel({
                        servico: function(callback){
                            mysql.query(sqlS, [user.id], function(err, result){
                                if(err || result.length < 1) return callback(err, null);
                                return callback(null, result);
                            });
                        },
                        convenio: function(callback){
                            mysql.query(sqlC, [user.id], function(err, result){
                                if(err || result.length < 1) return callback(err, null);
                                async.map(result, processaConvenio, function(err, results) {
                                    return callback(null, results);
                                });
                            });
                        },
                        online: (callback) => {
                            if( !user.usuario_id ) return callback();
                            UsuariosOnline.estaOnline( empresaID, user.usuario_id )
                            .then( online => {
                                user.online = online;
                                callback();
                            }).catch( () => callback() );
                        }
                    }, function(err, result){
                        if(result.servico) user.servico = result.servico;
                        if(result.convenio) user.convenio = result.convenio;

                        resolve(user);
                    });
                });
            });
        }// getMedico
        
        /*
         * Retorna os Médicos que realizam um determinado serviço
         */
        function getMedicosDoServico (empresaID, servicoID) {
            return new Promise( function ( resolve){
                const select = `SELECT p.id, p.nome, p.ativo, u.foto, p.tratamento, p.especialidade, p.usuario_id, s.valor 
                    FROM profissional_has_servico s
                    LEFT JOIN profissional p ON (p.id = s.profissional_id) 
                    LEFT JOIN usuario u ON (u.id = p.usuario_id) 
                    WHERE s.servico_id = ? AND p.empresa_id = ?`;
                
                mysql.query(select, [servicoID, empresaID], function(err, result){
                    if(err) return resolve([]);
                    resolve(result);
                });
            });
        }
        
        /*
         * Adiciona um novo profissional
         * Somente administrador
         */
        function add (empresaID, user, dados) {
            return new Promise( function ( resolve, reject){
                
                let data;
                let medicoID = null, dadosUsuario = null;

                let senha = geraCodigo(8),
                senhaMD5 = crypto.createHash('md5').update(senha).digest('hex'),
                token = uuid.v1(),
                senhaEmail, 
                empresaNome;

                const validar =  function(callback) {
                    validacao.valida(empresaID, user.perfil, dados).then(function(_data){
                        data = _data;
                        empresaNome = data.empresaNome;
                        delete data.empresaNome;

                        callback(null, null);
                    }).catch(function(erro){
                        callback(erro, null);
                    });
                };
                
                let conexao;
                const transaction = function(callback) {
                    let pool = mysql.pool;
                    pool.getConnection(function (err, connection) {
                        if (err) return callback('erro interno');
                        conexao = connection;
                        conexao.beginTransaction(function(err) {
                            if (err) { return callback('erro interno', null);}
                            callback(null, null);
                        });
                    });
                };
                
                const Medico = function(callback) {
                    let insert = _.omit(data, ['horario', 'servico', 'convenio', 'contato', 'senha']);
                    insert.horario = JSON.stringify(data.horario);
                    insert.empresa_id = empresaID;
                    insert.usuario_id = dadosUsuario.id;
                    
                    if(!data.nascimento) insert.nascimento = null;
                    if(!data.cpf) insert.cpf = null;
                    if(!data.cep) insert.cep = null;
                    if(!data.celular) insert.celular = null;
                    if(!data.telefone) insert.telefone = null;
                    if(!data.conselho) insert.conselho = null;
                    if(!data.conselho_uf) insert.conselho_uf = null;
                    if(!data.conselho_nr) insert.conselho_nr = null;
                    if(!data.email) insert.email = null;
                    if(!data.tratamento) insert.tratamento = null;
                    if(!data.especialidade) insert.especialidade = null;
                    
                    conexao.query('INSERT INTO profissional SET ?', [insert], function(err, result){
                        if(err || result.length === 0) return callback('Erro interno ao salvar dados do profissional', null);
                        medicoID = result.insertId;
                        callback(err, result.insertId);
                    });
                };
                
                const Convenio = function(callback) {
                    if(_.isEmpty(data.convenio)) return callback(null, null);
                    let convenios = [];
                    
                    async.each(data.convenio, function(conv, callbackEach){
                        convenios.push([medicoID, conv]);
                        callbackEach();
                    }, function(err){
                        if(err) return callback(err, null);
                        if(_.isEmpty(convenios)) return callback(null, null);
                        
                        conexao.query('INSERT INTO profissional_has_convenio (profissional_id, convenio_id) VALUES ?', [convenios], function(err, result){
                            if(err || result.length === 0) return callback('Erro interno ao registrar convênios', null);
                            callback(err, null);
                        });
                    });
                };
                
                const Servico = function(callback) {
                    if(_.isEmpty(data.servico)) return callback(null, null);
                    let insertServico = [];
                    async.each(data.servico, function(serv, callbackEach){
                        insertServico.push([medicoID,serv.id, serv.valor]);
                        callbackEach();
                    }, function(err){
                        if(err) return callback(err, null);
                        if(_.isEmpty(insertServico)) return callback(null, null);
                        
                        conexao.query('INSERT INTO profissional_has_servico (profissional_id, servico_id, valor) VALUES ?', [insertServico], function(err, result){
                            if(err || result.length == 0) return callback('Erro interno ao registrar serviços', null);
                            callback(err, null);
                        });
                    });
                };
                
                const Horario = function(callback) {
                    if(_.isEmpty(data.horario)) return callback(null, null);
                    let insertHorario = [];
                    let dia;
                    async.forEachOf(data.horario, function(horarios, _dia, callbackDia){
                        dia = _dia;
                        if(_.isEmpty(horarios) || !_.isArray(horarios)) {
                            return callbackDia();
                        }
                        async.each(horarios, function(h, callbackHora){
                            insertHorario.push([empresaID, medicoID, dia, h.de, h.a]);
                            callbackHora();
                        }, function(){
                            callbackDia();
                        });
                    }, function(err){
                        if(err) return callback(err, null);
                        if(_.isEmpty(insertHorario)) return callback(null, null);
                        conexao.query('INSERT INTO profissional_horario (empresa_id, profissional_id, dia, de, a) VALUES ?', [insertHorario], function(err, result){
                            if(err || result.length == 0) return callback('Erro interno ao registrar horários', null);
                            callback(err, null);
                        });
                    });
                };

                const Usuario = (callback) => {
                    dadosUsuario = {
                        empresa_id: empresaID,
                        perfil: 'p',
                        nome: data.nome,
                        email: data.email,
                        ativo: data.ativo,
                        celular: data.celular || null,
                        fone: data.telefone || null
                    };

                    if( data.senha == 'gerar') {
                        dadosUsuario.senha = senhaMD5;
                        senhaEmail = senha;
                    } else {
                        dadosUsuario.senha = null;
                        dadosUsuario.token_rs = token;
                        dadosUsuario.dt_token_rs = new Date();
                    }

                    conexao.query('INSERT INTO usuario SET ?', [dadosUsuario], (err, result) => {
                        if(err || !result) return callback('Erro interno ao registrar conta do usuário', null);
                        if( !result.insertId ) return callback('Erro interno ao registrar conta do usuário', null);
                        dadosUsuario.id = result.insertId;
                        callback();
                    });
                };

                /**
                 * Verifica se a empresa tem assinatura vigente, com todos os profissionais
                 * ATIVO, se tiver, é para colocar o profissional recem cadastrado
                 * na tabela "profissional_faturar", indicando que o mesmo deve
                 * ser faturado, a partir dessa data
                 */
                const Assinatura = ( callback ) => {
                    conexao.query(`SELECT id, status FROM v_assinatura WHERE empresa_id = ? AND profissional = 'todos' ORDER BY id DESC LIMIT 1`, [ empresaID ], ( erro, result ) => {
                        if( erro || !result ) return callback('Erro interno');
                        if( result.length === 0 ) return callback();// nao tem assinatura vigente
                        if( result[0].status == '5' || result[0].status == '6' ) return callback(); // o plano foi cancelado

                        // empresa com plano PRÓ, ativo para TODOS os profissionais
                        let dados = {
                            empresa_id: empresaID,
                            assinatura_id: result[0].id,
                            profissional_id: medicoID
                        };
                        conexao.query(`INSERT INTO profissional_faturar SET ?`, [dados], (erro, result) => {
                            if( erro || !result ) return callback( 'erro interno ao registrar profissionais 2' );
                            if( result.affectedRows == 0 ) return callback('erro interno ao registrar profissionais 2');
                            callback();
                        });

                    });
                };

                /**
                 * Depois de tudo
                 */
                const Notifica = () => {
                    evento.emit( notificacaoProf + 'add', empresaID, medicoID ); // novo profissional

                    let userNotificacao = _.omit(dadosUsuario, ['empresa_id', 'senha', 'token_rs', 'dt_token_rs']);
                    userNotificacao.profissional_id = medicoID;
                    evento.emit( 'usuario.add', empresaID, userNotificacao ); // novo usuário

                    // envia e-mail ao usuário recém cadastrado
                    let tokenID = crypto.createHash('md5').update( dadosUsuario.id.toString()).digest('hex');
                    
                    if( empresaNome ) { // quando o nome da empresa foi encontrado
                        EnviaEmail.usuarioCadastrado( data.email, data.nome, 'profissional', empresaNome, token, tokenID, senhaEmail );
                        return;
                    }

                    // busca o nome da empresa, quando o mesmo não foi localizado no processo de validação
                    mysql.query('SELECT nome FROM empresa WHERE id = ? LIMIT 1', [empresaID], ( erro, result ) => {
                        if( erro || !result ) return;
                        if( result.length == 0 ) return;
                        EnviaEmail.usuarioCadastrado( data.email, data.nome, 'profissional', result[0].nome, token, tokenID, senhaEmail );
                    });
                };

                /**
                 * cria as seções de prontuário no final, depois de ter cadastrado
                 * o profissional
                 */
                const CriaProntuarioPadrao = () => {
                    let usuario = {
                        id: dadosUsuario.id,
                        perfil: 'p',
                        empresa_id: empresaID,
                        token: '',
                        loginID: 0,
                        sessaoID: 0
                    };
                    
                    prontuario.criaProntuariosPadrao(empresaID, usuario).then( secaoID => { }).catch( erro => { } );

                };
                
                // processa
                async.series({
                    valida: validar,
                    transaction: transaction,
                    usuario: Usuario,
                    medido: Medico,
                    convenio: Convenio,
                    servico: Servico,
                    horario: Horario,
                    assinatura: Assinatura
                },
                function(err, result){
                    // aqui será feito o comit ou rollback
                    if(err) {
                        reject(err);
                        if( conexao ) conexao.rollback(function(){conexao.release();});
                    }else{
                        conexao.commit(function(err) {
                            if(err) {
                                reject('Erro interno');
                                conexao.rollback(function(){conexao.release();});
                            }else {
                                conexao.release();
                                resolve({id: medicoID, usuario_id: dadosUsuario.id});
                                Notifica();
                                CriaProntuarioPadrao();
                            }
                        });
                    }
                });
            });
        }//add
        
        /*
         * Atualiza os dados básicos do médico
         * Somente administrador
         */
        function edit (empresaID, user, dados) {
            return new Promise( ( resolve, reject)=> {
                let medicoID, usuarioID, empresaNome, emailAntigo, autor, dadosUsuario;
                const validar =  (callback)=> {
                    validacao.validaEdit(empresaID, user, dados).then((_data)=> {
                        dados = _data;
                        medicoID = dados.id;
                        usuarioID = dados.usuario_id;
                        empresaNome = dados.empresaNome;
                        emailAntigo = dados.emailAntigo;

                        autor = user.id == dados.usuario_id ? 'você' : 'um administrador';

                        delete dados.id;
                        delete dados.usuario_id;
                        delete dados.empresaNome;
                        delete dados.emailAntigo;

                        callback();
                    }).catch((erro)=>{
                        callback(erro);
                    });
                };
                
                let conexao;
                const transaction = function(callback) {
                    let pool = mysql.pool;
                    pool.getConnection(function (err, connection) {
                        if (err) return callback('erro interno');
                        conexao = connection;
                        conexao.beginTransaction(function(err) {
                            if (err) { return callback('erro interno', null);}
                            callback();
                        });
                    });
                };
                
                const Medico = (callback)=>{
                    if(!dados.nascimento) dados.nascimento = null;
                    if(!dados.cpf) dados.cpf = null;
                    if(!dados.cep) dados.cep = null;
                    if(!dados.celular) dados.celular = null;
                    if(!dados.telefone) dados.telefone = null;
                    if(!dados.conselho) dados.conselho = null;
                    if(!dados.conselho_uf) dados.conselho_uf = null;
                    if(!dados.conselho_nr) dados.conselho_nr = null;
                    if(!dados.email) dados.email = null;
                    if(!dados.tratamento) dados.tratamento = null;
                    if(!dados.especialidade) dados.especialidade = null;
                    if(!dados.nota) dados.nota = null;

                    conexao.query('UPDATE profissional SET ? WHERE id = ? AND empresa_id = ?', [dados, medicoID, empresaID], (err, result)=> {
                        if(err || result.length == 0) return callback('Erro interno ao atualizar dados', null);
                        callback(err);
                    });
                };

                const Usuario = (callback) => {
                    dadosUsuario = {
                        nome: dados.nome,
                        email: dados.email,
                        ativo: dados.ativo,
                        celular: dados.celular || null,
                        fone: dados.telefone || null
                    };

                    conexao.query('UPDATE usuario SET ? WHERE id = ? AND empresa_id = ?', [dadosUsuario, usuarioID, empresaID], (err, result) => {
                        if(err || result.length == 0) return callback('Erro interno ao atualizar dados do usuario', null);
                        callback();
                    });
                };


               /**
                 * Depois de tudo
                 */
                const Notifica = () => {
                    // emite evento: profissional atualizado
                    evento.emit( notificacaoProf + 'edit', empresaID, medicoID, dados );

                    // emite evento: usuário atualizado
                    dadosUsuario = Object.assign( {perfil: user.perfil, profissional_id: medicoID}, dadosUsuario);
                    evento.emit( 'usuario.edit', empresaID, usuarioID, dadosUsuario ); // novo usuário

                    // envia e-mail
                    let emailAlterado = emailAntigo != dados.email;
                    EnviaEmail.usuarioDadosAlterados( dados.email, dados.nome, 'profissional', empresaNome, autor, emailAlterado );
                    if( emailAlterado ) evento.emit( 'usuario.emailAtualizado', empresaID, usuarioID, dados.email );
                };

                
                // processa
                async.series({
                    valida: validar,
                    transaction: transaction,
                    medico: Medico,
                    usuario: Usuario
                },
                (err) => {
                    // aqui será feito o comit ou rollback
                    if(err) {
                        reject(err);
                        if( conexao ) conexao.rollback(() => conexao.release() );
                    }else{
                        conexao.commit((err)=> {
                            if(err) {
                                reject('Erro interno');
                                conexao.rollback(()=> conexao.release() );
                            }else {
                                conexao.release();
                                resolve();
                                Notifica();
                            }
                        });
                    }
                });
            });
        }//edit
        
        /*
         * Atualiza o horario de um médico
         * Somente administrador
         */
        function editHorario (empresaID, user, medicoID, horario) {
            return new Promise( function ( resolve, reject) {
                let horarios;
                const validar =  function(callback) {
                    validacao.validaHorario(user, medicoID, horario).then(function(_data){
                        horarios = _data;
                        callback(null, null);
                    }).catch(function(erro){
                        callback(erro, null);
                    });
                };
                
                let conexao;
                const transaction = function(callback) {
                    let pool = mysql.pool;
                    pool.getConnection(function (err, connection) {
                        if (err) return callback('erro interno');
                        conexao = connection;
                        conexao.beginTransaction(function(err) {
                            if (err) { return callback('erro interno', null);}
                            callback(null, null);
                        });
                    });
                };
                
                const Medico = function(callback){
                    let update = {horario: JSON.stringify(horarios)};
                    conexao.query('UPDATE profissional SET ? WHERE id = ? AND empresa_id = ?', [update, medicoID, empresaID], function(err, result){
                        if(err || result.length == 0) return callback('Erro interno ao atualizar dados', null);
                        callback(err, null);
                    });
                };
                
                const Remove = function(callback){
                    conexao.query('DELETE FROM profissional_horario WHERE profissional_id = ? AND empresa_id = ?', [medicoID, empresaID], function(err){
                        if(err) return callback('Erro interno ao atualizar dados', null);
                        callback(err, null);
                    });
                };
                
                const Horario = function(callback){
                    if(_.isEmpty(horarios)) return callback(null, null);
                    let insertHorario = [];
                    let dia;
                    async.forEachOf(horarios, function(horarios, _dia, callbackDia){
                        dia = _dia;
                        if(_.isEmpty(horarios) || !_.isArray(horarios)) {
                            return callbackDia();
                        }
                        async.each(horarios, function(h, callbackHora){
                            insertHorario.push([empresaID, medicoID, dia, h.de, h.a]);
                            callbackHora();
                        }, function(){
                            callbackDia();
                        });
                    }, function(err){
                        if(err) return callback(err, null);
                        if(_.isEmpty(insertHorario)) return callback(null, null);
                        conexao.query('INSERT INTO profissional_horario (empresa_id, profissional_id, dia, de, a) VALUES ?', [insertHorario], function(err, result){
                            if(err || result.length == 0) return callback('Erro interno ao atualizar dados', null);
                            callback(err, null);
                        });
                    });
                };
                
                // processa
                async.series({
                    valida: validar,
                    transaction: transaction,
                    medico: Medico,
                    delete: Remove,
                    horario: Horario
                },
                function(err, result){
                    // aqui será feito o comit ou rollback
                    if(err) {
                        reject(err);
                        if( conexao ) conexao.rollback(function(){conexao.release();});
                    }else{
                        conexao.commit(function(err) {
                            if(err) {
                                reject('Erro interno');
                                conexao.rollback(function(){conexao.release();});
                            }else {
                                conexao.release();
                                resolve();
                                evento.emit( notificacaoProf + 'editHorario', empresaID, medicoID, horarios );
                            }
                        });
                    }
                });
            });
        }//editHorario
        
        /*
         * Atualiza os convênios de um médico
         * Somente administrador
         */
        function editConvenio (empresaID, user, medicoID, convenio) {
            return new Promise( function ( resolve, reject) {
                let convenios;
                const validar =  function(callback) {
                    validacao.validaConvenio(user, medicoID, convenio).then(function(_data){
                        convenios = _data;
                        callback(null, null);
                    }).catch(function(erro){
                        callback(erro, null);
                    });
                };
                
                let conexao;
                const transaction = function(callback) {
                    let pool = mysql.pool;
                    pool.getConnection(function (err, connection) {
                        if (err) return callback('erro interno');
                        conexao = connection;
                        conexao.beginTransaction(function(err) {
                            if (err) { return callback('erro interno', null);}
                            callback(null, null);
                        });
                    });
                };
                
                const Remove = function(callback){
                    conexao.query('DELETE FROM profissional_has_convenio WHERE profissional_id = ?', [medicoID], function(err){
                        if(err) return callback('Erro interno ao atualizar dados', null);
                        callback(err, null);
                    });
                };
                
                const Convenio = function(callback){
                    if(_.isEmpty(convenios)) return callback(null, null);
                    let _convenios = [];
                    
                    async.each(convenios, function(conv, callbackEach){
                        _convenios.push([medicoID, conv]);
                        callbackEach();
                    }, function(err){
                        if(err) return callback(err, null);
                        if(_.isEmpty(_convenios)) return callback(null, null);
                        
                        conexao.query('INSERT INTO profissional_has_convenio (profissional_id, convenio_id) VALUES ?', [_convenios], function(err, result){
                            if(err || result.length == 0) return callback('Erro interno ao salvar dados', null);
                            callback(err, null);
                        });
                    });
                };
                
                // processa
                async.series({
                    valida: validar,
                    transaction: transaction,
                    delete: Remove,
                    convenio: Convenio
                },
                function(err, result){
                    // aqui será feito o comit ou rollback
                    if(err) {
                        reject(err);
                        if( conexao ) conexao.rollback(function(){conexao.release();});
                    }else{
                        conexao.commit(function(err) {
                            if(err) {
                                reject('Erro interno');
                                conexao.rollback(function(){conexao.release();});
                            }else {
                                conexao.release();
                                resolve();
                                evento.emit( notificacaoProf + 'editConvenio', empresaID, medicoID, convenios );
                            }
                        });
                    }
                });
            });
        }//editConvenio
        
        /*
         * Atualiza os serviços de um médico
         * Somente administrador
         */
        function editServico (empresaID, user, medicoID, servicos) {
            return new Promise( function ( resolve, reject) {
                
                const validar =  function(callback) {
                    validacao.validaServico(user, medicoID, servicos).then(function(_data){
                        servicos = _data;
                        callback();
                    }).catch(function(erro){
                        callback(erro);
                    });
                };
                
                let conexao;
                const transaction = function(callback) {
                    let pool = mysql.pool;
                    pool.getConnection(function (err, connection) {
                        if (err) return callback('erro interno');
                        conexao = connection;
                        conexao.beginTransaction(function(err) {
                            if (err) { return callback('erro interno', null);}
                            callback();
                        });
                    });
                };
                
                const Remove = function(callback){
                    conexao.query('DELETE FROM profissional_has_servico WHERE profissional_id = ?', [medicoID], function(err){
                        if(err) return callback('Erro interno ao atualizar dados', null);
                        callback(err, null);
                    });
                };

                const Servico = function(callback){
                    if(_.isEmpty(servicos)) return callback(null, null);
                    let insertServico = [];
                    async.each(servicos, function(serv, callbackEach){
                        insertServico.push([medicoID,serv.id, serv.valor]);
                        callbackEach();
                    }, function(err){
                        if(err) return callback(err, null);
                        if(_.isEmpty(insertServico)) return callback(null, null);
                        
                        conexao.query('INSERT INTO profissional_has_servico (profissional_id, servico_id, valor) VALUES ?', [insertServico], function(err, result){
                            if(err || result.length == 0) return callback('Erro interno ao salvar dados', null);
                            callback(err, null);
                        });
                    });
                };
                
                // processa
                async.series({
                    valida: validar,
                    transaction: transaction,
                    delete: Remove,
                    servico: Servico
                },
                function(err){
                    if(err) {
                        reject(err);
                        if( conexao ) conexao.rollback(function(){conexao.release();});
                    }else{
                        conexao.commit(function(err) {
                            if(err) {
                                reject('Erro interno');
                                conexao.rollback(function(){conexao.release();});
                            }else {
                                conexao.release();
                                resolve();
                                evento.emit( notificacaoProf + 'editServico', empresaID, medicoID, servicos );
                            }
                        });
                    }
                });
            });
        }//editServico
        
        /*
         * Remove um médico e todas as associações que houver, exceto com atendimento e assinatura
         * Somente administrador tem permissão
         * 
         * FIXME: antes de tentar excluir, checar se o profissional pode ser excluído, ou seja,
         * verificar se ele não tem atendimentos, se não esta sendo referenciado em outra
         * tabela da qual não pode ser excluído...
         * 
         * FIXME: quando o usuário que esta relacionado na ASSINATURA for excluído,
         * (quando isso for possível) NÃO esquecer de atualizar o registro desse
         * usuário na tabela "profissional_faturar"
         */
        function del(empresaID, userID, perfil, profissionalID) {
            return new Promise( ( resolve, reject )=> {
                if(perfil !== 'a') return reject('Você não tem permissão para excluir profissionais');

                let conexao,
                usuarioID,
                imagemUsuario,
                profissional;

                let transaction = function(callback) {
                    let pool = mysql.pool;
                    pool.getConnection(function (err, connection) {
                        if (err) return callback('erro interno');
                        conexao = connection;
                        conexao.beginTransaction(function(err) {
                            if (err) { return callback('erro interno');}
                            callback();
                        });
                    });
                };

                const getProfissional = ( callback ) => {
                    conexao.query( `SELECT p.usuario_id, u.foto, ga.id AS ga_id, ga.token AS ga_token, ga.refresh_token AS ga_refresh_token, ga.agenda_id AS ga_agenda_id, 
                        (SELECT COUNT(*) FROM atendimento WHERE profissional_id = p.id AND empresa_id = p.empresa_id ) AS atendimentos
                        FROM profissional p
                        LEFT JOIN usuario AS u ON (u.id = p.usuario_id)
                        LEFT JOIN google_agenda AS ga ON (ga.profissional_id = p.id AND ga.ativo = 's')
                        WHERE p.id = ? AND p.empresa_id = ? 
                        LIMIT 1`, 
                    [profissionalID, empresaID], ( erro, result ) => {
                        if( erro || !result ) return callback('Erro interno 1');
                        if( result.length == 0 ) return callback('Esse profissional não existe');
                        let atendimentos = result[0].atendimentos;
                        if( atendimentos > 0 ) {
                            let plural = atendimentos > 0 ? 's' : '';
                            return callback(`Esse profissional não pode ser excluído. Há ${atendimentos} atendimento${plural} relacionado${plural}`);
                        }
                        usuarioID = result[0].usuario_id;
                        imagemUsuario = result[0].foto;
                        profissional = result[0];
                        callback();
                    });
                }

                const removeProfissional = ( callback ) => {
                    conexao.query('DELETE FROM profissional WHERE id = ? AND empresa_id = ? AND usuario_id = ? LIMIT 1', [profissionalID, empresaID, usuarioID], (err, result) => {
                        if(err) {
                            log.registraErro( JSON.stringify( err, null, 0), 'mysql', 'Arquivo: src/controller/profissional/profissional.js -> del -> removeProfissional');
                            if( err.code == 'ER_ROW_IS_REFERENCED_2') return callback('Este profissional tem registros que o impede de ser removido');
                            return callback('Erro interno 2');
                        }
                        callback();
                    });
                }

                const removeUsuario = ( callback ) => {
                    conexao.query('DELETE FROM usuario WHERE id = ? AND empresa_id = ?', [usuarioID, empresaID], (err, result) => {
                        if(err) {
                            log.registraErro( JSON.stringify( err, null, 0), 'mysql', 'Arquivo: src/controller/profissional/profissional.js -> del -> removeUsuario');
                            if( err.code == 'ER_ROW_IS_REFERENCED_2') return callback('Este profissional tem registros que o impede de ser removido');
                            return callback('Erro interno 3');
                        }
                        callback();
                    });
                }

                const removeFotoUsuario = ( callback ) => {
                    if( !imagemUsuario || _.isEmpty( imagemUsuario )) return callback();
                    let pasta= storage.getPastaUsuario( empresaID, usuarioID );

                    storage.deletaArquivo( `${pasta}/${imagemUsuario}` )
                    .then( () => {
                        callback();
                    })
                    .catch( erro => {
                        callback();
                        let msg = `Falha ao remover imagem do perfil do usuário (ao remover profissional)

Código de erro: ${erro.code}
Arquivo: ${imagemUsuario}
ID da empresa: ${empresaID}
ID do usuário: ${usuarioID}`;
                        log.registraErro( msg, 'arquivo,storage', 'Arquivo: src/controller/profissional/profissional.js');
                    });
                }

                const removeAutorizacaoGoogleAgenda = ( callback ) => {
                    if( !profissional.ga_token || _.isEmpty(profissional.ga_token) ) return callback(); // não há o que revogar

                    callback(); // não precisa aguardar as tarefas abaixo serem concluídas

                    agendaUtil.revogaAutorizacao( profissional.ga_token, profissional.ga_refresh_token, profissional.ga_agenda_id ).then( result => {
                    }).catch( erro => {
                    });

                    // remove os dados do banco de dados
                    conexao.query('DELETE FROM google_agenda WHERE empresa_id = ? AND usuario_id = ?', [empresaID, usuarioID], (err, result) => {
                    });
                }

                const notifica = () => {
                    evento.emit( notificacaoProf + 'del', empresaID, profissionalID );
                    evento.emit( 'usuario.del', empresaID, usuarioID );
                }


                // processa
                async.series({
                    transaction: transaction,
                    getProfissional: getProfissional,
                    removeProfissional: removeProfissional,
                    removeUsuario: removeUsuario,
                    removeFotoUsuario: removeFotoUsuario,
                    removeAutorizacaoGoogleAgenda: removeAutorizacaoGoogleAgenda
                },
                function(err, result){
                    // aqui será feito o comit ou rollback
                    if(err) {
                        reject(err);
                        if( conexao ) conexao.rollback(function(){conexao.release();});
                    }else{
                        conexao.commit(function(err) {
                            if(err) {
                                reject('Erro interno');
                                conexao.rollback(function(){conexao.release();});
                            }else {
                                resolve();
                                conexao.release();
                                notifica();
                            }
                        });
                    }
                });

                ///////////////////////////////

                // 1º pega o usuario_id
                // mysql.query( 'SELECT usuario_id FROM profissional WHERE id = ? AND empresa_id = ? LIMIT 1', [profissionalID, empresaID], ( erro, result ) => {
                //     if( erro || !result ) return reject('Erro interno');
                //     if( result.length == 0 ) return reject('Esse profissional não existe');
                //     let usuarioID = result[0].usuario_id;

                //     // remove o profissional
                //     mysql.query('DELETE FROM profissional WHERE id = ? AND empresa_id = ?', [profissionalID, empresaID], (err, result) => {
                //         if(err) {
                //             if( err.code == 'ER_ROW_IS_REFERENCED_2') return reject('Este profissional tem registros que o impede de ser removido');
                //             return reject('Erro interno');
                //         }
                //         resolve();
                //         evento.emit( notificacaoProf + 'del', empresaID, profissionalID );
                //         evento.emit( 'usuario.del', empresaID, usuarioID );
                //     });
                // });
            });
        }//del

        /**
         * Verifica se o profissional autorizou a agenda do google
         * 
         * REGRAS
         * - o usuário deve ser um profissional
         * - a empresa deve ser assinante do plano pró (plano ativo)
         * - o profissional deve ter os recursos pró liberados
         */
        function getUrlAutorizacaoGoogleAgenda( empresaID, user ) {
            return new Promise( (resolve, reject) => {              
                validacao.validaGoogleAgendaGetUrl( user ).then( () => {
                    let url = GCalendar.getUrlAutorizacao( 'offline' );
                    resolve( url );
                }).catch( erro => {
                    reject( erro );
                });
            });
        }

        /**
         * Etapa 2 da autorização para atualizar a agenda do profissional
         * 
         * REGRAS
         * as mesmas de 'getUrlAutorizacaoGoogleAgenda'
         */
        function registraAutorizacaoGoogleAgenda( empresaID, user, code ) {
            return new Promise( (resolve, reject) => {

                let token, 
                agenaID, 
                agendaGoogleID,
                profissional,
                empresaNome,
                fusoHorario = 'America/Sao_Paulo';

                const Valida = (callback) => {
                    validacao.validaGoogleAgenda( user ).then( _value => {
                        empresaNome = _value.empresaNome;
                        delete _value.empresaNome;
                        profissional = _value;
                        callback();

                    }).catch( erro => {
                        callback( erro );
                    });
                };

                const GetToken = (callback) => {
                    GCalendar.getTokenDeAcesso( code ).then( _token => {
                        token = _token;
                        callback();
                    }).catch( erro => {
                        log.registraErro( JSON.stringify( erro, null, 0), 'google-agenda', 'Arquivo: src/controller/profissional/profissional.js -> registraAutorizacaoGoogleAgenda -> GetToken');
                        callback( 'Erro interno' );
                    });
                };

                const RegistraTokenDB = ( callback ) => {
                    let insert = {
                        empresa_id: empresaID,
                        profissional_id: user.profissional_id, 
                        usuario_id: user.id,
                        ativo: 's',
                        code: code,
                        timeZone: fusoHorario,
                        agenda_id: agendaGoogleID,
                        token: token.access_token,
                        refresh_token: token.refresh_token,
                        expiry: new Date( token.expiry_date )
                    };

                    mysql.query(`INSERT INTO google_agenda SET ?`, [insert], (err, result) => {
                        if( err || !result ) return callback('Erro interno ao salvar dados');
                        if( result.length === 0 ) return callback('Erro interno ao salvar dados');
                        agenaID = result.insertId;
                        callback();
                    });
                };

                const CriaAgendaNoGoogle = (callback) => {
                    // busca os dados da agenda principal
                    GCalendar.getCalendario( token.access_token, 'primary' )
                    .then( agenda => {
                        fusoHorario = agenda.timeZone || 'America/Sao_Paulo';
                        
                        let nome = profissional.nome;
                        if ( profissional.tratamento ) nome = `${profissional.tratamento} ${profissional.nome}`;

                        GCalendar.criaAgenda( token.access_token, fusoHorario, nome, agendaGoogleID )
                        .then( agendaNova => {
                            agendaGoogleID = agendaNova.id;
                            callback();
                        }).catch( erro => {
                            callback( 'Erro ao registrar dados' );
                        });

                    }).catch( erro => {
                        callback( 'erro interno' );
                        log.registraErro( JSON.stringify( erro, null, 0), 'google-agenda', 'Arquivo: src/controller/profissional/profissional.js -> registraAutorizacaoGoogleAgenda -> CriaAgendaNoGoogle');
                    });
                }

                /**
                 * Em caso de falha na criação da agenda, no registro do banco ou qualquer outro tipo de falha
                 * revoga a autorização
                 */
                const revogaAutorizacao= () => {
                    if( !token ) return;
                    GCalendar.revogaAutorizacao( token.token, token.refresh_token )
                    .then( result => {})
                    .catch( erro => {});
                }

                /**
                 * Cadastra na agenda do google agendamentos com até 7 dias atrás
                 */
                const criaAgendamentosRecentes = () => {
                    agendaUtil.criaAgendamentosRecentesGoogle( empresaID, profissional.id, agendaGoogleID, fusoHorario, token );
                }

                async.series([
                    Valida, GetToken, CriaAgendaNoGoogle, RegistraTokenDB
                ],(err, result) => {
                    if( err ) {
                        revogaAutorizacao();
                        return reject( err );
                    }
                    resolve( );

                    criaAgendamentosRecentes();

                    let dadosRedis = {
                        id: agenaID,
                        timeZone: fusoHorario,
                        agenda_id: agendaGoogleID,
                        token: token.access_token,
                        refresh_token: token.refresh_token,
                        expiry: token.expiry_date
                    };
                    agendaUtil.agendaGoogleConfigurada( empresaID, user.profissional_id, dadosRedis );
                    
                    evento.emit( 'usuario.googleCalenarAutorizacao', empresaID, user.id, true );
                });
            });
        }

        /**
         * O usuário não tem mais interesse em manter agenda sincronizada. Devemos remover
         * 
         */
        function revogaAutorizacaoGoogleAgenda( empresaID, user ) {
            return new Promise( (resolve, reject) => {
                if( user.perfil != 'p' ) return reject('Você não tem permissão');

                let agenda;
                const GetDadosDb = ( callback ) => {
                    mysql.query(`SELECT id, token, refresh_token, expiry, agenda_id FROM google_agenda WHERE empresa_id = ? AND profissional_id = ? AND ativo = 's' ORDER BY id DESC LIMIT 1`, [ empresaID, user.profissional_id ], (err, result) => {
                        if(err || !result) return callback("erro interno");
                        if( result.length === 0 ) return callback( 0 );
                        agenda = result[0];
                        callback();
                    });
                };

                const RevogaAutorizacao = ( callback ) => {
                    agendaUtil.revogaAutorizacao( agenda.token, agenda.refresh_token, agenda.agenda_id ).then( result => {
                        callback();
                    }).catch( erro => {
                        callback( 'Erro na comunicação com o google' );
                    });
                };

                const RemoveDadosDB = ( callback ) => {
                    // remove os registros anteriores, mas preserva o último agendamento
                    const deletaAgendaAntigas = ( callbackInterno ) => {
                        mysql.query(`DELETE FROM google_agenda WHERE empresa_id = ? AND profissional_id = ? AND ativo = 'n' AND id != ?`, [ empresaID, user.profissional_id, agenda.id ], (err, result) => {
                            callbackInterno();
                        });
                    }

                    // Atualiza a sincronização que acabou de ser inativada
                    // estou preservando esse dados para sabermos quem já utilizou
                    const updateAgendaAtual = ( callbackInterno ) => {
                        mysql.query(`UPDATE google_agenda SET ativo = 'n', dt_inativou = NOW() WHERE empresa_id = ? AND profissional_id = ? AND id = ?`, 
                        [ empresaID, user.profissional_id, agenda.id ], ( err,result) => {
                            callbackInterno();
                        });
                    }

                    async.parallel([deletaAgendaAntigas, updateAgendaAtual
                    ], (err, result) => {
                        callback();
                    });
                    
                }

                async.series([
                    GetDadosDb, RevogaAutorizacao, RemoveDadosDB
                ],(err, result) => {
                    if( err ) {
                        if( err != 0 ) return reject( err );
                    }
                    resolve( );

                    agendaUtil.agendaGoogleRemovida( empresaID, user.profissional_id );

                    evento.emit( 'usuario.googleCalenarAutorizacao', empresaID, user.id, false );
                });
                
            });
        }
        
    }
    
    if(instance === null) instance = new Medico();
    module.exports = Medico;
    Medico.Medico = instance;
}());