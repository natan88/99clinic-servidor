;(function () {
    "use strict";    

    const Promise = require("promise"),
        mysql = require('src/util/conexoes.js'),
        _ = require('underscore'),
        async = require('async'),
        moment = require('moment'),
        evento = require('src/eventos/eventosInternos'),
        prontuario = require('src/controller/profissional/profissional_prontuario_padrao').MedicoProntuariosIniciais,
        log = require('src/util/logInterno'),
        storage = require('src/lib/storage/googleStorage');

    let instance = null;

    function Util() {
        let self = this;

        self.adicionaDadosDeDemonstracao = adicionaDadosDeDemonstracao;
        self.temDadosDeDemonstracao = temDadosDeDemonstracao;
        self.removeDadosDeDemonstracao = removeDadosDeDemonstracao;
        self.cadastraProfissionalPadrao = cadastraProfissionalPadrao;
     
        /**
         * Adiciona os seguintes dados de demonstração:
         * - Serviços
         * - Convênios
         * - Profissionais
         * - Pacientes
         * - Atendimentos
         * 
         * Deve ser chamado assim que a empresa valida o cadastro (clica no link de validação)
         */
        function adicionaDadosDeDemonstracao( empresaID ) {
            let conexao;
            let srvCGiD, srvPiD, srvCiD;
            let convBraID, convAmilID;
            let profMarioID, profJoseID, profCarmenID;
            let userMarioID, userJoseID, userCarmenID;
            let usuarioID;
    
            const Transaction = (callback) => {
                const pool = mysql.pool;
                pool.getConnection( (err, connection) => {
                    if (err) return callback('erro interno');
                    conexao = connection;
                    conexao.beginTransaction( (err) => callback( err, null));
                });
            };

            const selectUsuario = (callback) => {
                conexao.query('SELECT id FROM usuario WHERE empresa_id = ? ORDER BY id ASC LIMIT 1', [empresaID], (err, result) => {
                    if( err || !result || result.length == 0 ) return callback('Erro interno');
                    usuarioID = result[0].id;

                    callback( err, null );
                });
            };
            
            const cadastraServicos = (callback) => {
                const dados = [
                    [empresaID, 'Consulta clinico Geral (demo)', 'DEMONSTRAÇÃO', 90.00, 30, 30, 's'], // comissão 40.00
                    [empresaID, 'Consulta pediatria (demo)', 'DEMONSTRAÇÃO', 78.00, 30, 30, 's'], // comissão 35.00
                    [empresaID, 'Consulta cardiologia (demo)', 'DEMONSTRAÇÃO', 120.00, 30, 30, 's'] // comissão 70.00
                ];
                conexao.query('INSERT INTO servico (empresa_id, nome, descricao, valor, tempo, prazo_retorno, demo) VALUES ?', [dados], (err, result) => {
                    if(err) return callback({origem: 'cadastraServicos', erro: err});
                    srvCGiD = result.insertId;
                    srvPiD = srvCGiD + 1;
                    srvCiD = srvCGiD + 2;
                    callback();
                });
            };
    
            const cadastraConvenios = (callback) => {
                const dados = [
                    [empresaID, 'Bradesco'], [empresaID, 'Amil'], [empresaID, 'Unimed'],
                    [empresaID, 'Hapvida'], [empresaID, 'SulAmérica'],[empresaID, 'Porto Seguro Saúde'],
                    [empresaID, 'Caixa Saúde'],[empresaID, 'Nossa Saúde'],[empresaID, 'Goldencross'],
                    [empresaID, 'Smile Saúde'],[empresaID, 'Intermédica'],[empresaID, 'Allianz Saúde'],
                    [empresaID, 'Santa Helena Saúde'],[empresaID, 'GreenLine'],[empresaID, 'Marítima Saúde'],
                    [empresaID, 'Omint'],[empresaID, 'One Health'],[empresaID, 'São Cristovão Saúde'],
                    [empresaID, 'Trasmontano Saúde'],[empresaID, 'Clinipam'],[empresaID, 'Promed'],
                    [empresaID, 'Samp'],[empresaID, 'Vivamed'],[empresaID, 'Assim Saúde'],
                    [empresaID, 'Notredame'],[empresaID, 'Medsênior'],[empresaID, 'Gamec'],
                    [empresaID, 'Ameplan'],[empresaID, 'Amesp'],[empresaID, 'Biovida'],
                    [empresaID, 'Blue Med'],[empresaID, 'Care Plus'],[empresaID, 'lasses Laboriosas'],
                    [empresaID, 'Garantia Saúde'],[empresaID, 'Samel'],[empresaID, 'Evangélico Saúde']
                ];
                conexao.query('INSERT INTO convenio (empresa_id, nome) VALUES ?', [dados], (err, result) => {
                    if(err) return callback({origem: 'cadastraConvenios', erro: err});
                    convBraID = result.insertId;
                    convAmilID = convBraID + 1;
                    callback();
                });
            };

            /////////
            const cadastraUsuarioProfissioal = (callback)=> {
                const dados = [
                    [empresaID, 'p', 'Mário Gonzalez (demo)', 'mario.gonzales@gmail.com', 's'],
                    [empresaID, 'p', 'José Silveira (demo)', 'jose.silveira@gmail.com', 's'],
                    [empresaID, 'p', 'Carmen Juarez (demo)', 'carmen.juarez@gmail.com', 's'],
                ];
                conexao.query('INSERT INTO usuario (empresa_id, perfil, nome, email, ativo) VALUES ?', [dados], (err, result) => {
                    if(err) return callback({origem: 'cadastraUsuarioProfissioal', erro: err});
                    userMarioID = result.insertId;
                    userJoseID = userMarioID + 1;
                    userCarmenID = userMarioID + 2;
                    callback();
                });
            };
            /////////
    
            const cadastraProfissional = (callback) => {               
                const dados = [
                    [empresaID, userMarioID, 'Mário Gonzalez (demo)', 'm', '1980-12-17', 'sp', 'São Paulo', 'mario.gonzales@gmail.com', '11991919191', '1130303030', 'CRM', 'SP', '199317', 's', 's', '{"mon":[{"de":"08:00","a":"18:00"}],"tue":[{"de":"08:00","a":"18:00"}],"wed":[{"de":"08:00","a":"18:00"}],"thu":[{"de":"08:00","a":"18:00"}],"fri":[{"de":"08:00","a":"18:00"}],"sat":[{"de":"10:00","a":"14:00"}],"sun":[]}'],
                    [empresaID, userJoseID, 'José Silveira (demo)', 'm', '1972-08-25', 'sp', 'São Paulo', 'jose.silveira@gmail.com', '11992929292', '1131313131', 'CRM', 'SP', '198873', 's', 's', '{"mon":[{"de":"08:00","a":"18:00"}],"tue":[{"de":"08:00","a":"18:00"}],"wed":[{"de":"08:00","a":"18:00"}],"thu":[{"de":"08:00","a":"18:00"}],"fri":[{"de":"08:00","a":"18:00"}],"sat":[],"sun":[]}'],
                    [empresaID, userCarmenID, 'Carmen Juarez (demo)', 'f', '1992-03-05', 'sp', 'São Paulo', 'carmen.juarez@gmail.com', '11993939393', '1135353535', 'CRM', 'SP', '200577', 's', 's', '{"mon":[],"tue":[{"de":"08:00","a":"12:00"}],"wed":[],"thu":[{"de":"08:00","a":"12:00"}],"fri":[{"de":"13:30","a":"18:00"}],"sat":[],"sun":[]}']
                ];
                conexao.query('INSERT INTO profissional (empresa_id, usuario_id, nome, sexo, nascimento, uf, cidade, email, celular, telefone, conselho, conselho_uf, conselho_nr, ativo, demo, horario) VALUES ?', [dados], (err, result) => {
                    if(err) return callback({origem: 'profissional', erro: err});
                    profMarioID = result.insertId;
                    profJoseID = profMarioID + 1;
                    profCarmenID = profMarioID + 2;
    
                    async.parallel({
                        convenio: ( callback ) => {
                            const conveniosProfs = [[profMarioID, convBraID],[profMarioID, convAmilID],[profJoseID, convBraID],[profCarmenID, convAmilID]];
                            conexao.query('INSERT INTO profissional_has_convenio (profissional_id, convenio_id) VALUES ?', [conveniosProfs], (err, result) => {
                                if(err) return callback({origem: 'profissional.conveinio', erro: err});
                                callback(err, null);
                            });
                        },
                        servico: ( callback ) => {
                            const srvProf = [[profMarioID, srvCGiD, 40.00],[profJoseID, srvCiD, 35.00],[profCarmenID, srvPiD, 70.00],];
                            conexao.query('INSERT INTO profissional_has_servico (profissional_id, servico_id, valor) VALUES ?', [srvProf], (err, result) => {
                                if(err) return callback({origem: 'profissional.servico', erro: err});
                                callback(err, null);
                            });
                        },
                        horario: ( callback ) => {
                            const horariosProf = [
                                [empresaID, profMarioID, 'mon', '08:00:00', '18:00'],
                                [empresaID, profMarioID, 'tue', '08:00:00', '18:00'],
                                [empresaID, profMarioID, 'wed', '08:00:00', '18:00'],
                                [empresaID, profMarioID, 'thu', '08:00:00', '18:00'],
                                [empresaID, profMarioID, 'fri', '08:00:00', '18:00'],
                                [empresaID, profMarioID, 'sat', '10:00:00', '14:00'],
    
                                [empresaID, profJoseID, 'mon', '08:00:00', '18:00'],
                                [empresaID, profJoseID, 'tue', '08:00:00', '18:00'],
                                [empresaID, profJoseID, 'wed', '08:00:00', '18:00'],
                                [empresaID, profJoseID, 'thu', '08:00:00', '18:00'],
                                [empresaID, profJoseID, 'fri', '08:00:00', '18:00'],
    
                                [empresaID, profCarmenID, 'tue', '08:00:00', '12:00'],
                                [empresaID, profCarmenID, 'thu', '08:00:00', '12:00'],
                                [empresaID, profCarmenID, 'fri', '13:00:00', '18:00'],
                            ];
                            conexao.query('INSERT INTO profissional_horario (empresa_id, profissional_id, dia, de, a) VALUES ?', [horariosProf], (err, result) => {
                                if(err) return callback({origem: 'profissional.horario', erro: err});
                                callback(err, null);
                            });
                        }
                    }, (err) => callback( err, null ));
                });
            };
    
            let rozivaldoID, brunoID, gilbertoID, andreiaID, enzoID, mariaID;
            const cadastraPaciente = (callback) => {
                const dados = [
                    [empresaID, 'Rozivalda Andrade da Silva (demo)', 'f', 'sp', 'São Paulo', 'centro', 'Av. Barão Araújo, 1234', 's'],
                    [empresaID, 'Bruno Oliveira da Mata (demo)', 'm', 'sp', 'Campinas', 'Nova Campinas', 'Rua Artur Bernardes, 514', 's'],
                    [empresaID, 'Gilberto Lopes (demo)', 'm', 'sp', 'São Paulo', 'Liberdade', 'Rua Barão de Iguape, 874', 's'],
                    [empresaID, 'Andreia Aquino de Souza (demo)', 'f', 'sp', 'São Paulo', 'Ipiranga', 'Rua Acaçá, 187', 's'],
                    [empresaID, 'Enzo Viturino (demo)', 'm', 'sp', 'São Paulo', 'Limão', 'Travessa Anajane, 132', 's'],
                    [empresaID, 'Maria flor (demo)', 'f', 'sp', 'São Paulo', 'São Domingos', 'Rua Abraham Lincoln, 999', 's'],
                ];
                conexao.query('INSERT INTO cliente (empresa_id, nome, sexo, uf, cidade, bairro, endereco, demo) VALUES ?', [dados], (err, result) => {
                    if(err) return callback({origem: 'paciente', erro: err});
                    rozivaldoID = result.insertId;
                    brunoID = rozivaldoID + 1;
                    gilbertoID = rozivaldoID + 2;
                    andreiaID = rozivaldoID + 3;
                    enzoID = rozivaldoID + 4;
                    mariaID = rozivaldoID + 5;
                    callback(err, null);
                });
            };
    
            const cadastraAtendimento = (callback) => {
                let hoje1 = moment.utc().set({hour:8,minute:0,second:0});
                let hoje2 = moment.utc().set({hour:8,minute:30,second:0});
                let hoje3 = moment.utc().set({hour:9,minute:0,second:0});
                let hoje4 = moment.utc().set({hour:9,minute:30,second:0});
                let hj1 = moment.utc().add( -1, 'd').set({hour:13,minute:30,second:0}); // ontem
                let hj2 = moment.utc().add( 1, 'd').set({hour:13,minute:30,second:0}); // amanhã

                let agora = new Date();
                const dados = [
                    [empresaID, rozivaldoID,profMarioID, srvCGiD, convBraID, null, 'Consulta Clínico Geral', 90.00, 40.00, hoje1.format("YYYY-MM-DD HH:mm"), null, '0001', 's', 90.00, hoje1.format("YYYY-MM-DD"), 'convênio', 3, agora, 's'],
                    [empresaID, brunoID,    profMarioID, srvCGiD, null, null, 'Consulta Clínico Geral', 90.00, 40.00, hoje2.format("YYYY-MM-DD HH:mm"), null, null, 'n', 90.00, hoje2.format("YYYY-MM-DD"), 'dinheiro', 3, agora, 's'],
                    [empresaID, gilbertoID, profMarioID, srvCGiD, null, null, 'Consulta Clínico Geral', 90.00, 40.00, hoje3.format("YYYY-MM-DD HH:mm"), null, null, 'n', null, null, 'dinheiro', 2, agora, 's'],
                    [empresaID, andreiaID,  profMarioID, srvCGiD, convAmilID, null, 'Consulta Clínico Geral', 90.00, 40.00, hoje4.format("YYYY-MM-DD HH:mm"), null, '0002', 's', null, null, null, 1, agora, 's'],

                    [empresaID, enzoID, profJoseID, srvCiD, convBraID, null, 'Consulta cardiologia', 120.00, 70.00, hj1.format("YYYY-MM-DD HH:mm"), hj1.format("YYYY-MM-DD HH:mm"), '0003', 's',120.00, hj1.format("YYYY-MM-DD"), 'convênio', 5, agora, 's'],
                    [empresaID, mariaID,profJoseID, srvCiD, null, null, 'Consulta cardiologia', 120.00, 70.00, hj2.format("YYYY-MM-DD HH:mm"), null, null, 'n', null, null, null, 6, agora, 's'],

                    [empresaID, andreiaID, profCarmenID, srvPiD, convAmilID, null, 'Consulta Pediatra', 78.00, 35.00, hj1.format("YYYY-MM-DD HH:mm"), hoje4.format("YYYY-MM-DD HH:mm"), '0004', 's',78.00, hoje4.format("YYYY-MM-DD"), 'convênio', 3, agora, 's'],
                    [empresaID, mariaID,profCarmenID, srvPiD, null, null, 'Consulta Pediatra', 78.00, 35.00, hj2.format("YYYY-MM-DD HH:mm"), null, null, 'n', null, null, null, 2, agora, 's'],
                ];
                let atID1, atID2, atID3, atID4, atID5, atID6, atID7, atID8;
                conexao.query(`INSERT INTO atendimento (empresa_id, cliente_id, profissional_id, servico_id, convenio_id, 
                    atendimento_id, procedimento, valor, comissao, dt_agenda, dt_servico, convenio_cod, preferencia_prof, pg_valor, pg_dt, pg_forma, status, status_data, demo) VALUES ?`, [dados], (err, result) => {
                        if(err) return callback({origem: 'atendimento', erro: err});
                    atID1 = result.insertId;
                    atID2 = atID1 + 1;
                    atID3 = atID1 + 2;
                    atID4 = atID1 + 3;
                    atID5 = atID1 + 4;
                    atID6 = atID1 + 5;
                    atID7 = atID1 + 6;
                    atID8 = atID1 + 7;
                    
                    let status = [
                        [usuarioID, atID1, 3],
                        [usuarioID, atID2, 3],
                        [usuarioID, atID3, 2],
                        [usuarioID, atID4, 1],
                        [usuarioID, atID5, 5],
                        [usuarioID, atID6, 6],
                        [usuarioID, atID7, 3],
                        [usuarioID, atID8, 2]
                    ];
                    conexao.query('INSERT INTO atendimento_status (usuario_id, atendimento_id, status ) VALUES ?', [status], (err, result) => {
                        callback( err, null );
                    });
                });
            };
            
            // processa
            async.series([
                Transaction,
                selectUsuario,
                cadastraServicos, 
                cadastraConvenios, 
                cadastraUsuarioProfissioal,
                cadastraProfissional, 
                cadastraPaciente, 
                cadastraAtendimento
            ], 
            (err) => {
                if(err) {
                    conexao.rollback(() => conexao.release() );
                }else {
                    conexao.commit((err) => {
                        if(err) {
                            conexao.rollback(() => conexao.release() );
                        }else {
                            conexao.release();
                        }
                    });
                }
            });
        } // adicionaDadosDeDemonstracao

        function temDadosDeDemonstracao ( empresaID ) {
            return new Promise( ( resolve) => {
                mysql.query('SELECT count(*) AS total FROM profissional WHERE empresa_id = ? AND demo="s"', [empresaID], (err, result) => {
                    if( err || !result || result.length == 0 ) return resolve( false );
                    resolve( result[0].total > 0 );
                });
            });
        }


        function removeDadosDeDemonstracao ( empresaID ) {
            return new Promise( ( resolve, reject) => {
                let conexao,
                profissionais;  
                      
                const Transaction = (callback) => {
                    const pool = mysql.pool;
                    pool.getConnection( (err, connection) => {
                        if (err) return callback('erro interno');
                        conexao = connection;
                        conexao.beginTransaction( (err) => callback( err, null));
                    });
                };

                const getProfissionais = ( callback ) => {
                    conexao.query(`SELECT p.usuario_id, u.foto FROM profissional p
                        LEFT JOIN usuario AS u ON (u.id = p.usuario_id)
                        WHERE p.empresa_id = ? AND demo = 's'`, 
                    [empresaID], ( err, result ) => {
                        if( err ) return callback( 'Erro interno');
                        if( result && result.length ) {
                            profissionais = result;
                        }
                        callback();
                    });
                }

                const removeUsuarios = ( callback ) => {
                    if( !profissionais || !profissionais.length ) return callback();
                    let usuariosID = profissionais.map( p => p.usuario_id );

                    conexao.query('DELETE FROM usuario WHERE empresa_id = ? AND id IN(?)', [ empresaID, usuariosID ], (err, result) => {
                        if(err) {
                            if( err.code == 'ER_ROW_IS_REFERENCED_2') return callback('Profissional com registros que o impedem de ser removido');
                            return callback('Erro interno 3');
                        }
                        callback();
                    });
                }

                const removeImagensUsuarios = ( ) => {
                    if( !profissionais || !profissionais.length ) return;
                    let pasta;

                    for (const prof of profissionais) {
                        if( !prof.foto ) continue;
                        pasta = storage.getPastaUsuario( empresaID, prof.usuario_id );

                        storage.deletaArquivo( `${pasta}/${prof.foto}` )
                        .then( () => {})
                        .catch( erro => {
                            let msg = `Falha ao remover imagem do perfil do usuário (ao remover dados de demonstração)
    
                            Código de erro: ${erro.code}
                            Arquivo: ${prof.foto}
                            ID da empresa: ${empresaID}
                            ID do usuário: ${prof.usuario_id}`;
                            log.registraErro( msg, 'arquivo,storage', 'Arquivo: src/controller/profissional/profissional.js');
                        });
                    }
                }

                const removeAtendimento = (callback) => {
                    conexao.query('DELETE FROM atendimento WHERE empresa_id = ? AND demo = ?', [empresaID, 's'], (err, result) => {
                        callback( err, null);
                    });
                };
                
                const removeServicos = (callback) => {
                    conexao.query('DELETE FROM servico WHERE empresa_id = ? AND demo = ?', [empresaID, 's'], (err, result) => {
                        callback( err, null);
                    });
                };
        
                const removeProfissional = (callback) => {               
                    conexao.query('DELETE FROM profissional WHERE empresa_id = ? AND demo = ?', [empresaID, 's'], (err, result) => {
                        callback( err, null);
                    });
                };
        
                const removePaciente = (callback) => {
                    conexao.query('DELETE FROM cliente WHERE empresa_id = ? AND demo = ?', [empresaID, 's'], (err, result) => {
                        callback( err, null);
                    });
                };
                
                // processa
                async.series([
                    Transaction,
                    getProfissionais,
                    removeAtendimento,
                    removeServicos,
                    removeProfissional,
                    removePaciente,
                    removeUsuarios
                ], 
                (err) => {
                    if(err) {
                        conexao.rollback(() => conexao.release() );
                        reject();
                    }else {
                        conexao.commit((err) => {
                            if(err) {
                                conexao.rollback(() => conexao.release() );
                                reject();
                            }else {
                                conexao.release();
                                resolve();
                                evento.emit( 'util.removeDadosDemonstracao', empresaID );
                                removeImagensUsuarios();
                            }
                        });
                    }
                });
            });
        }

        /**
         * Cadastra o usuário administrador como profissional, para que o mesmo
         * possa começar a usar o sistema imediatamente após a validação do cadastro
         * 
         * Cacastra também: 
         * - serviço
         * - horário
         * - prontuário
         */
        function cadastraProfissionalPadrao ( empresaID ) {
            let conexao,
            profissional,
            usuario,
            servicoID;

            let horario = {"mon":[{"de":"08:00","a":"12:00"},{"de":"13:00","a":"17:00"}],"tue":[{"de":"08:00","a":"12:00"}],"wed":[],"thu":[{"de":"13:00","a":"17:00"}],"fri":[{"de":"19:00","a":"23:00"}],"sat":[{"de":"08:00","a":"13:00"}],"sun":[]};
            
            const Transaction = (callback) => {
                const pool = mysql.pool;
                pool.getConnection( (err, connection) => {
                    if (err) return callback('erro interno');
                    conexao = connection;
                    conexao.beginTransaction( (err) => callback( err ));
                });
            };

            const selectUsuario = (callback) => {
                mysql.query('SELECT empresa_id, nome, email, fone, senha, facebook_id FROM usuario WHERE empresa_id = ? ORDER BY id ASC LIMIT 1', [empresaID], (err, result) => {
                    if( err || !result || result.length == 0 ) return callback('Erro interno');
                    usuario = {...result[0] };
                    profissional = {...result[0] };
                    delete profissional.senha;
                    delete profissional.facebook_id;

                    callback( err );
                });
            };

            const cadastraServico = (callback) => {
                const insert = {
                    empresa_id: empresaID,
                    nome: 'Consulta',
                    valor: 100.00,
                    tempo: 30,
                    prazo_retorno: 30
                };
                conexao.query('INSERT INTO servico SET ?', [insert], (err, result) => {
                    if( err || !result ) return callback("erro ao cadastrar serviço");
                    if( !result.insertId ) return callback("erro ao cadastrar serviço");
                    servicoID = result.insertId;
                    callback();
                });
            };

            const cadastraUsuario = (callback) => {
                usuario.perfil = 'p';
                usuario.ativo = 's';

                conexao.query('INSERT INTO usuario SET ?', [usuario], (err, result) => {
                    if( err || !result ) return callback("erro ao cadastrar usuário");
                    if( !result.insertId ) return callback("erro ao cadastrar usuário");
                    usuario.id = result.insertId;
                    callback();
                });
            };

            const cadastraProfissional = function(callback) {
                profissional.horario = JSON.stringify( horario );
                profissional.usuario_id = usuario.id;
                profissional.telefone = profissional.fone;
                delete profissional.fone;
                
                conexao.query('INSERT INTO profissional SET ?', [profissional], function(err, result){
                    if( err || !result ) return callback("erro ao cadastrar profissional");
                    if( !result.insertId ) return callback("erro ao cadastrar profissional");
                    profissional.id = result.insertId;
                    callback();
                });
            };

            const cadastraProfissionalServico = (callback) => {
                const srvProf = {
                    profissional_id: profissional.id,
                    servico_id: servicoID,
                    valor: 50.00
                };
                conexao.query('INSERT INTO profissional_has_servico SET ?', [srvProf], (err, result) => {
                    if( err || !result ) return callback("erro ao cadastrar profissional-serviço");
                    // if( !result.insertId ) return callback("erro ao cadastrar profissional-serviço");// se falhar, continua assim mesmo
                    callback();
                });
            };

            const cadastraProfissionalHorario = (callback) => {
                const horariosProf = [];

                for (const [dia, horas] of Object.entries(horario)) {
                    if( !horas.length ) continue;
                    horas.map( h => {
                        horariosProf.push( [empresaID, profissional.id, dia, h.de, h.a] );
                    });
                }

                if( !horariosProf.length ) return callback();
                
                conexao.query('INSERT INTO profissional_horario (empresa_id, profissional_id, dia, de, a) VALUES ?', [horariosProf], (err, result) => {
                    if( err || !result ) return callback("erro ao cadastrar profissional-horario");
                    callback();
                });
            };


                /**
                 * cria a seção de prontuário no final, depois de ter cadastrado
                 * o profissional
                 */
                const criaProntuarioPadrao = ( callback ) => {
                    callback(); // continua processando depois do callback

                    let user = {
                        id: usuario.id,
                        perfil: 'p',
                        empresa_id: empresaID,
                        token: '',
                        loginID: 0,
                        sessaoID: 0
                    };
                    
                    prontuario.criaProntuariosPadrao(empresaID, user).then( secaoID => { }).catch( erro => { } );
                };


            // processa
            async.series([
                Transaction,
                selectUsuario,
                cadastraServico, 
                cadastraUsuario,
                cadastraProfissional, 
                cadastraProfissionalServico, 
                cadastraProfissionalHorario,
                criaProntuarioPadrao
            ], 
            (err) => {
                if(err) {
                    if( conexao ) {
                        conexao.rollback(() => conexao.release() );
                    }
                }else {
                    conexao.commit((err) => {
                        if(err) {
                            conexao.rollback(() => conexao.release() );
                        }else {
                            conexao.release();
                        }
                    });
                }
            });


        } // cadastraProfissionalPadrao

    }//Util
    
    if(instance === null) instance = new Util();
    module.exports = Util;
    Util.Util = instance;
}());