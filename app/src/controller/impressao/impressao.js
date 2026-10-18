/* jshint -W030 */
{ 
    "use strict";

    /**
     * devolve dados em PDF, inicialmente o prontuário com os dados do paciente
     */
    
     const 
        mysql = require('src/util/conexoes.js'),
        validacao = require('src/controller/impressao/impressao-validacao.js'),
        _ = require('underscore'),
        async = require('async'),
        fs = require('fs'),
        uuid = require('uuid'),
        moment = require('moment'),
        pdfMake = require('pdfmake'),
        htmlToPdfmake = require("html-to-pdfmake"),
        jsdom = require("jsdom"),
        { JSDOM } = jsdom,
        { window } = new JSDOM(""),
        StringMask = require('string-mask'),
        Cliente = require("src/controller/cliente/cliente.js").Cliente,
        atendimento = require('src/controller/atendimento/atendimento'),
        storage = require('src/lib/storage/googleStorage'),
        conf = require('src/util/config'),
        request = require('request').defaults({ encoding: null }),
        util = require('src/util/util'),
        log = require('src/util/logInterno');

    const maskFone = new StringMask('(00) 90000-0000'),
        maskCPF = new StringMask('000.000.000-00');
        // maskCEP = new StringMask('00000-000');

    class Impressao {
        constructor( usuario ) {
            this.empresaID = usuario.empresa_id;
            this.usuario = usuario; 

            this.pdf = null;
            this.cliente = null;
            this.profissional = null;
            this.empresa = null;
            this.nomeArquivo = 'impressao-prontuario-' + uuid.v4() + '.pdf';

            this.configUser = {
                imprimirImagens: false
            };

            let fonts = {
                Helvetica: {
                  normal: 'Helvetica',
                  bold: 'Helvetica-Bold',
                  italics: 'Helvetica-Oblique',
                  bolditalics: 'Helvetica-BoldOblique'
                },
                Symbol: {
                  normal: 'Symbol'
                }
            };

            this.headerAltura = 120;
            this.rodapeAltura = 85;
            this.margens = {
                left: 30, top: this.headerAltura, right: 30, bottom: this.rodapeAltura
            };

            /**
             * opções de configuração do "HTML TO PDF"
             * 
             * Além do objeto WINDOW, estou zerando o estilo padrão do plugin, para poder usar o estilo makePDF
             */
            this.htmlToPdfOptions = {
                window: window,
                defaultStyles: {
                    h1: { fontSize : '', marginBottom: '', bold: '' },
                    h2: { fontSize : '', marginBottom: '', bold: '' },
                    h3: { fontSize : '', marginBottom: '', bold: '' },
                    h4: { fontSize : '', marginBottom: '', bold: '' },
                    h5: { fontSize : '', marginBottom: '', bold: '' },
                    h6: { fontSize : '', marginBottom: '', bold: '' },
                    th: { bold: '', fillColor:''},
                    p: { margin:''},
                }
            }

            this.logomarca = undefined;

            // DOC style: https://pdfmake.github.io/docs/document-definition-object/styling/
            this.docDefinicao = {
                pageSize: 'A4',
                pageMargins: [ this.margens.left, this.margens.top, this.margens.right, this.margens.bottom ], // [left, top, right, bottom] or [horizontal, vertical] or just a number for equal margins

                info: {
                    title: 'Impressão do prontuário do paciente - 99Clinic',
                    producer: '99Clinic.com',
                    creator: '99Clinic.com'
                },
                
                defaultStyle: {
                    font: 'Helvetica',
                    fontSize: 15,
                    color: '#000',
                    markerColor: '#333',// marcador de lista #00A3D9
                    lineHeight: 1.35
                },

                styles: {
                    header: {
                        margin: [ this.margens.left, 30, this.margens.right, 25 ],
                        color: '#444'
                    },
                    'header-linha1': {
                        fontSize: 17,
                        bold: true
                    },
                    'header-linha2': {
                        fontSize: 14,
                        bold: false
                    },
                    'header-fone': {
                        fontSize: 13,
                        alignment: 'right',
                        color: '#333'
                    },

                    'prontuario-title': {
                        fontSize: 14,
                        bold: true,
                        marginBottom: 5
                    },
                    'prontuario-text': {
                        fontSize: 13,
                        lineHeight: 2
                    },
                    'atendimento-title': {
                        fontSize: 16,
                        bold: true
                    },
                    'atendimento-subtitle': {
                        fontSize: 12,
                        bold: false,
                        color: '#707070'
                    },
                    'atendimento-date': {
                        fontSize: 12,
                        bold: false,
                        color: '#707070',
                        alignment: 'right'
                    },

                    subheader: {
                        fontSize: 14
                    },

                    'po-content': {
                        margin: [0,6,0,0],
                        fontSize: 13
                    },

                    // Estilo do editor HTML 
                    'ql-align-center': {
                        alignment: 'center'
                    },
                    'ql-align-right': {
                        alignment: 'right'
                    },
                    'ql-align-left': {
                        alignment: 'left'
                    },
                    'ql-align-justify': {
                        alignment: 'justify'
                    },
                    'ql-indent-1': {
                        marginLeft: 20
                    },
                    // fim estilo editor HTML

                    // Plugin HTML TO PDF
                    'html-h1': {
                        fontSize : 17,
                        bold: true
                    },
                    'html-h2': {
                        fontSize : 16,
                        bold: false
                    },
                    'html-p': {
                        fontSize : 14,
                    },
                    // Plugin HTML TO PDF


                    center: { alignment: 'center'},
                    left: { alignment: 'left'},
                    right: { alignment: 'right'},
                    right: { alignment: 'right'},

                    footer: {
                        fontSize: 16
                    }
                },

                tableLayouts : {
                    'preciscao-oculos': {
                        hLineStyle: (i, node) => 0.3,
                        vLineStyle: (i, node) => 0.3,
                        hLineWidth: (i, node) => 0.3,
                        vLineWidth: (i, node) => 0.3,
                        hLineColor: (i, node) => '#707070',
                        vLineColor: (i, node) => '#707070'
                    }
                },

                content: []
            };

            this.printer = new pdfMake( fonts );// new pdfMake( fonts );
        }


        getProntuarioPDF ( dados ) {
            return new Promise( ( resolve, reject ) => {

                const Valida = ( callback ) => {
                    validacao.valida( this.usuario.empresa_id, this.usuario, dados )
                    .then( data => {
                        dados = data;
                        this.configUser.imprimirImagens = data.imprimirImagens;
                        callback();
                    })
                    .catch( erro => {
                        callback( erro );
                    });
                };

                const GetDadosPaciente = ( callback ) => {
                    Cliente.getPaciente( this.usuario.empresa_id, dados.pacienteID )
                    .then( pac => {
                        if( !pac ) return callback('paciente não localizado');

                        this.cliente = pac;
                        if( this.cliente.sexo == 'm' ) this.cliente.sexo = 'Masculino';
                        if( this.cliente.sexo == 'f' ) this.cliente.sexo = 'Feminino';
                        if( pac.nascimento ) this.cliente.nascimento = moment(pac.nascimento).format('DD/MM/YYYY');

                        callback();
                    });
                };

                const GetProfissional = ( callback ) => {
                    mysql.query( `SELECT nome, tratamento, conselho, conselho_uf, conselho_nr, especialidade FROM profissional WHERE empresa_id = ? AND usuario_id = ? LIMIT 1`, [ this.usuario.empresa_id, this.usuario.id ], (erro, result) => {
                        if( erro || !result ) return callback( 'Erro interno' ); 
                        if( result.length === 0 )  return callback('profissional não localizado');
                        this.profissional = result[0];
                        callback( );
                    });
                };

                const GetEmpresa = ( callback ) => {
                    mysql.query( `SELECT nome, slogan, telefone, telefone2, telefone3, email, site, logo, uf, cidade, bairro, endereco, complemento FROM empresa WHERE id = ? LIMIT 1`, [ this.usuario.empresa_id ], (erro, result) => {
                        if( erro || !result ) return callback( 'Erro interno' ); 
                        if( result.length === 0 )  return callback('empresa não localizada');
                        this.empresa = result[0];

                        if( !this.empresa.logo ) return callback(); // se não tiver logo

                        // baixa a logomarca
                        this.getLogoEmpresaBase64CloudImage( this.empresa.logo )
                        .then( logoBase64 => {
                            this.logomarca = logoBase64;
                            callback();
                        }).catch( erroLogo => {
                            callback();
                        });
                    });
                }

                const GetProntuario = ( callback ) => {
                    const Atendimento = new atendimento( this.usuario );
                    if( dados.atendimentoID ) { // um prontuário de um atendimento específico
                        const erroTxt = 'Erro ao obter prontuário';
                        async.parallel({
                            prontuario: ( callbackInterno )  => {
                                let paraImpressao = true;
                                Atendimento.getProntuarioAtendimento( dados.atendimentoID, dados.prontuarioID, paraImpressao, this.configUser.imprimirImagens )
                                .then( prontuario => {
                                    if( !prontuario ) return callbackInterno('Paciente sem prontuário');
                                    callbackInterno( null, prontuario );
                                }).catch( erro => callbackInterno( erroTxt ) );
                            },
                            atendimento: ( callbackInterno ) => {
                                const col = [ this.usuario.empresa_id,  this.usuario.profissional_id,  dados.pacienteID, dados.atendimentoID ];
                                mysql.query(`SELECT a.id, a.dt_servico, a.dt_fim_atendimento, 
                                a.procedimento, a.status, 
                                cv.nome AS convenio_nome
                                FROM atendimento a 
                                LEFT JOIN convenio cv ON (cv.id = a.convenio_id)
                                WHERE a.empresa_id = ? AND a.profissional_id = ? AND a.cliente_id = ? AND a.id = ? AND a.status IN ('4', '5')
                                ORDER BY a.dt_servico LIMIT 1`, col, ( err, res ) => {
                                    if( err || !res ) return callbackInterno( erroTxt );
                                    if( res.length === 0 ) return callbackInterno( 'O atendimento parece não existir' );
                                    callbackInterno( null, res );// retorna array, para manter a compatibilidade com a versão que retorna todo o prontuário
                                });
                            }
                        }, ( erro, result ) => {
                            if ( erro ) return callback(erro);
                            // result.atendimento[0].form = result.prontuario;
                            result.atendimento[0].form = result.prontuario.form;
                            result.atendimento[0].anexo = result.prontuario.anexo;
                            this.prontuario = result.atendimento;
                            return callback();
                        });
                    } else { // prontuario completo do paciente
                        let paraImpressao = true;
                        Atendimento.getProntuarioPaciente( dados.pacienteID, 1, paraImpressao, this.configUser.imprimirImagens )
                        .then( prontuario => {
                            if( !prontuario ) return callback('Paciente sem prontuário');
                            this.prontuario = prontuario;
                            callback();
                        }).catch( erro => {
                            callback('Erro ao obter prontuário');
                        });
                    }
                };

                const ProcessaAnexos = ( callback ) => {
                    if( !this.prontuario || _.isEmpty( this.prontuario ) || !this.configUser.imprimirImagens ) return callback();

                    async.each( this.prontuario, ( prontuario, callbackProntuario ) => {
                        if( !prontuario.anexo || _.isEmpty( prontuario.anexo )) return callbackProntuario();

                        // baixa a imagem e a transforma em base64
                        async.each( prontuario.anexo, ( anexo, callbackAnexo ) => {
                            let imgLargura = 595 - this.margens.left - this.margens.right;
                            this.getImagemBase64CloudImage( '_prontuario_', anexo.arquivo, imgLargura, 'n' ) 
                            .then( file => {
                                anexo.url = file;
                                callbackAnexo();
                            }).catch( erro => { callbackAnexo(); })
                            
                        }, ( erro )=> {
                            callbackProntuario();
                        });// fim imagem

                    }, ( erro ) => {
                        callback();
                    });// fim prontuario
                }

                /**
                 * Pega os dados do banco de dados
                 */
                const GetDados = ( callback ) => {
                    async.parallel(
                        [ GetDadosPaciente, GetProfissional, GetEmpresa, GetProntuario ],
                    ( erro ) => {
                        callback( erro );
                    });
                };

                const GeraPDF = ( callback ) => {

                    // se o usuário quiser imprimir o cabeçalho
                    if( dados.imprimirCabecalho ) {
                        this.printCabecalho();
                    } else {
                        this.headerAltura = 30;
                        this.margens.top = 30
                    }

                    // se o usuário quiser imprimir o rodapé
                    if( dados.imprimirRodape ) {
                        this.printRodape();
                    } else {
                        this.rodapeAltura = 30;
                    }

                    // define a altura das margens top e bottom
                    this.docDefinicao.pageMargins = [ this.margens.left, this.margens.top, this.margens.right, this.rodapeAltura ];

                    // se o usuário quiser imprimir os dados do paciente
                    if( dados.imprimirPaciente ) {
                        this.printPaciente();
                    }

                    this.printProntuario();

                    // grava o PDF em arquivo
                    try {
                        // let fsw = fs.createWriteStream( './temp/' + this.nomeArquivo );
                        this.pdf = this.printer.createPdfKitDocument( this.docDefinicao );
                        // this.pdf.pipe( fsw );
                        // this.pdf.end();
                          
                        // this.pdf.on('end', () => {
                        //     callback();
                        // });

                        // TESTE, retirado daqui: https://kainikhil.medium.com/nodejs-how-to-generate-and-properly-serve-pdf-6835737d118e
                        this.pdf.pipe(
                            fs.createWriteStream( '/home/bsbinfor/servidor/temp/' + this.nomeArquivo ).on('error', (error) => {
                                // callback('Erro interno ao gerar arquivo');
                            }).on('end', () => {
                                // callback();
                            })
                        );

                        this.pdf.end();
                        this.pdf.on('end', () => {
                            callback();
                        });
                        // fim TESTE
                    } catch (error) {
                        callback('Erro ao gerar impressão');

                        let msg = `Falha na impressão - ID da empresa: ${this.empresaID} \n${JSON.stringify( error )}`;
                        log.registraErro( msg, 'impressao', 'Arquivo: src/controller/impressao/impressao.js - GeraPDF');
                    }
                };

                async.series([ Valida, GetDados, ProcessaAnexos, GeraPDF ],
                ( erro ) => {
                    if( erro ) return reject( erro );
                    resolve( this.nomeArquivo );
                });

            });
        }// getProntuarioPDF


        printCabecalho (  ) {
            let colunas = [];
            let conteudo = [{ text: this.empresa.nome, style: 'header-linha1' }];
            if( this.empresa.slogan ) conteudo.push({ text: this.empresa.slogan, style: 'header-linha2'});

            // Pega logo da empresa
            if( this.empresa.logo && this.logomarca ) {
                colunas.push({
                    width: 80,
                    image: this.logomarca,
                    absolutePosition: {
                        x: 20,
                        y: 10
                    }
                });
            }

            colunas.push({
                width: 'auto',
                stack: conteudo
            });

            // se tiver telefone
            if( this.empresa.telefone || this.empresa.telefone2 || this.empresa.telefone3 ) {
                let fones = [{ text: maskFone.apply( this.empresa.telefone.toString() ) }];
                
                if( this.empresa.telefone2 ) fones.push('',{ text: maskFone.apply( this.empresa.telefone2.toString() ) });
                if( this.empresa.telefone3 ) fones.push('',{ text: maskFone.apply( this.empresa.telefone3.toString() ) });

                colunas.push({
                    width: '*',
                    style: 'header-fone',
                    stack: fones
                });
            }

            this.docDefinicao.header = {
                style: 'header',
                stack: [
                    {
                        absolutePosition: { x: 0, y: 0 },
                        canvas: [{ type: 'line', x1: 0, y1: this.headerAltura - 25, x2: 595, y2: this.headerAltura - 25, lineWidth: 0.5, lineColor: '#666' }]
                    },
                    {
                        columns: colunas, 
                        columnGap: 10
                    }
                ]
            };
        } // printCabecalho

        printRodape() {
            let dataHoje = moment().utc(new Date()).utcOffset(-3).format('DD/MM/YYYY [às] HH:mm');

            let nomeProfissional = this.profissional.tratamento || '';
            if( this.profissional.tratamento ) nomeProfissional += ' ';
            nomeProfissional += this.profissional.nome;

            let conteudoProfissional = [
                {canvas: [{ type: 'line', x1: 10, y1: 1, x2: 595 / 2, y2: 1, lineWidth: 0.5 , lineColor: '#666'}]},
                { text: nomeProfissional, fontSize: 17, marginTop: 7 }
            ];

            if( this.profissional.especialidade) {
                conteudoProfissional.push( { text: this.profissional.especialidade, fontSize: 12, color: '#707070' } );
                this.rodapeAltura += 15;
            };

            let conselho = this.profissional.conselho ;
            if( conselho && this.profissional.conselho_uf) conselho += '/' + this.profissional.conselho_uf;
            if( conselho && this.profissional.conselho_nr) conselho += ': ' + this.profissional.conselho_nr;
            
            if( this.profissional.conselho && this.profissional.conselho_uf && this.profissional.conselho_nr) {
                conteudoProfissional.push( { text: conselho, fontSize: 12, color: '#707070' } );
            };
            this.rodapeAltura += 15;// + 15 por cada linha adiciona.

         
            //// ENDEREÇOS
            let end = this.empresa.endereco || '';
            if (this.empresa.bairro ) {
                if( end ) end += '\n';
                end += this.empresa.bairro;

            }

            if( this.empresa.cidade || this.empresa.bairro ) end += '\n';

            if (this.empresa.cidade ) {
                end += this.empresa.cidade;
                if( this.empresa.uf ) end += ' - ' +this.empresa.uf;
            }

            let conteudoEndereco = [
                {text: end, margin: [ 0, 35, this.margens.right, 0 ]} 
            ];
            //// fim endereço

            // redefine a altura do rodapé
            this.docDefinicao.pageMargins = [ this.margens.left, this.margens.top, this.margens.right, this.rodapeAltura ];

            let temp, marginProf = 35;
            this.docDefinicao.footer = (currentPage, pageCount) => {       
                temp = { text: `página ${currentPage} de ${pageCount} - gerado em ${dataHoje}`, bold: false, fontSize: 8, color: '#707070', margin: [0, 0, this.margens.right, 0] };

                if( currentPage === 1 ) {
                    conteudoEndereco.push( temp );
                } else {
                    conteudoEndereco[1] =  temp;
                    marginProf = 0;// depois da 1 página
                }

                return {
                        lineHeight: 1.5,
                        stack: [
                            {canvas: [{ type: 'line', x1: 0, y1: 1, x2: 595, y2: 1, lineWidth: 0.5, lineColor: '#666'}]},
                            {
                                columns: [
                                    {
                                        width: '50%',
                                        alignment: 'center',
                                        marginTop: marginProf,
                                        stack: conteudoProfissional
                                    },
                                    {
                                        width: '50%',
                                        alignment: 'right',
                                        fontSize: 11, color: '#707070',
                                        stack: conteudoEndereco
                                    }
                                ]
                            }
                        ]
                    }
                
            }
        }// printRodape


        printPaciente( ) {
            let cpfCliente = this.cliente.cpf || '';
            let idadeCliente = util.getIdadePaciente( this.cliente.nascimento );
            if( this.cliente.cpf && this.cliente.cpf.length == 11 ) cpfCliente = maskCPF.apply( this.cliente.cpf || '' );

            this.docDefinicao.content.push(
                {
                    margin: [0, -10, 0, 0],// espaçamento do cabeçalho, ainda é um teste
                    columns: [
                        {
                            width: '50%',
                            lineHeight: 1.6,
                            text: [
                                `Paciente: ${this.cliente.nome || ''}\n`,
                                `Nascimento: ${this.cliente.nascimento || ''}\n`,
                                `Prontuário: ${this.cliente.id}`
                            ]
                        },
                        {
                            width: '50%',
                            alignment: 'right',
                            lineHeight: 1.6,
                            text: [
                                `Sexo: ${this.cliente.sexo || ''}\n`,
                                `Idade: ${idadeCliente}\n`,
                                `CPF: ${cpfCliente}`
                            ]
                        }
                    ],
                    columnGap: 15
                },
                {
                    canvas: [
                        // { type: 'line', x1: 0, y1: -80, x2: 555, y2: -80, lineWidth: 0.5, lineColor: '#707070' }, //Up line
                        { type: 'line', x1: -100, y1: 0, x2: 595, y2: 0, lineWidth: 0.5, lineColor: '#666' }, //Bottom line
                        // { type: 'line', x1: 0, y1: -80, x2: 0, y2: 5, lineWidth: 0.5, lineColor: '#707070' }, //Left line
                        // { type: 'line', x1: 555, y1: -80, x2: 555, y2: 5, lineWidth: 0.5, lineColor: '#707070' }, //Rigth line
                    ]
                }
            );
        }//printPaciente

        /**
         * imprime o prontuário no PDF
         */
        printProntuario() {
            try {
            let temp;
            for (const p of this.prontuario) { // loop atendimento
                temp = moment( p.dt_servico ).format('DD/MM/YYYY [às] HH:mm');

                this.docDefinicao.content.push('\n',{
                    columns: [
                        {
                            width: 'auto',
                            margin: [0, 0, 0, 5],
                            text: [
                                { text: p.procedimento, style: 'atendimento-title'},
                                { text: `  ( ${p.convenio_nome ? p.convenio_nome : 'Particular'} )`, style: 'atendimento-subtitle'}
                            ]
                        },
                        {
                            width: '*',
                            alignment: 'right',
                            margin: [0, 0, 0, 5],
                            text: { text: temp, style: 'atendimento-date' }
                        }
                    ]
                });

                // FORMULÁRIO
                for (const form of p.form) { // formulário
                    for (const campo of form.campos) { // campo
                        switch( campo.tipo ) {
                            case 'select': 
                            case 'email': 
                                this.printCampoSimplesEmColuna( campo.nome, campo.resposta + '' || '' );
                                break;
                            case 'phone': 
                                this.printCampoFone( campo );
                                break;
                            case 'date': 
                                this.printCampoData( campo );
                                break;
                            case 'money': 
                                this.printCampoMoney( campo );
                                break;
                            case 'number': 
                                this.printCampoMumero( campo );
                                break;
                            case 'checkbox': 
                            case 'radio': 
                                this.printCampoRadioCheck( campo );
                                break;
                            case 'text': 
                                this.printCampoSimples( campo.nome, campo.resposta );
                                break;
                            case 'textarea': 
                                this.printCampoTextarea( campo );
                                break;
                            case 'pa': 
                                this.printCampoPA( campo );
                                break;
                            case 'po': 
                                this.printCampoPO( campo );
                                break;
                        }
                    } // fim campo
                } // fim formulário

                // ANEXO
                let temAnexoValido = p.anexo.findIndex( a => a.url ); // verifica se há pelo menos 1 imagem que teve os dados baixado
                if( p.anexo && p.anexo.length > 0 && this.configUser.imprimirImagens && temAnexoValido > -1 ) {
                    this.docDefinicao.content.push({ text: 'Imagens', style: 'prontuario-title', marginTop: 20 });

                    for (const anexo of p.anexo) {
                        if( !anexo.url ) continue;

                        this.docDefinicao.content.push({
                            stack: [
                                {
                                    text: anexo.nome || '', style: 'prontuario-text'
                                },
                                {
                                    image: anexo.url,
                                    // width: 595 - this.margens.right - this.margens.left,// não está sendo passado pois o cloudImage retorna a imagem com essa dimensão
                                    marginBottom: 10
                                }
                            ]
                        });
                    }
                }// fim anexo

            }// fim atendimemto
            
            } catch (error) {
                let msg = `Falha na impressão - ID da empresa: ${this.empresaID} \n${JSON.stringify( error )}`;
                log.registraErro( msg, 'impressao', 'Arquivo: src/controller/impressao/impressao.js - printProntuario');
            }
        }//printProntuario

        printCampoSimples( nome, resposta ) {
            let conteudo = ['\n'];
            if( nome ) {
                conteudo.push({ text: nome, style: 'prontuario-title'});
            }

            conteudo.push({ text: resposta, style: 'prontuario-text'});

            this.docDefinicao.content.push({ stack: conteudo });
        }

        printCampoSimplesEmColuna( nome, resposta ) {
            if( _.isEmpty( nome ) || _.isUndefined( nome ) ) {
                this.printCampoSimples( nome, resposta );
                return;
            }

            this.docDefinicao.content.push({
                text: [
                    { text: nome, style: 'prontuario-title'},
                    { text: `:  ${resposta}`, style: 'prontuario-text'}
                ]
            });
        }

        printCampoRadioCheck( campo ) {
            let texto = '';
            texto = campo.resposta.filter( r => r.checked );
            if( texto && texto.length > 0 ) {
                if( campo.conf && campo.conf.orientation && campo.conf.orientation == 'horizontal' ) {
                    texto = texto.map( t => t.value ).join(', '); // horizontal
                } else {
                    texto = texto.map( t => t.value +'\n' );// vertical
                }
            } else {
                texto = '';
            }
            
            this.printCampoSimples( campo.nome, texto );
        }

        printCampoTextarea ( campo ) {
            this.docDefinicao.content.push('\n');

            if( campo.nome ) {
                this.docDefinicao.content.push({ stack: [{ text: campo.nome, style: 'prontuario-title'}] });
            }
            
            let resposta = htmlToPdfmake( campo.resposta, this.htmlToPdfOptions );
            this.docDefinicao.content.push( resposta );
        }

        printCampoMoney( campo ) {
            this.printCampoSimplesEmColuna( campo.nome, 'R$ ' + this.currencyFormat( campo.resposta ) );
        }

        printCampoFone( campo ) {
            this.printCampoSimplesEmColuna( campo.nome, maskFone.apply(campo.resposta));
        }

        printCampoData( campo ) {
            let data = campo.resposta ? moment( campo.resposta ).format('DD/MM/YYYY') : '';
            this.printCampoSimplesEmColuna( campo.nome, data );
        }

        printCampoMumero( campo ) {
            let texto = '' + campo.resposta;

            if( campo.conf ) {
                if( campo.conf.casas ) {
                    let a = texto.split('.');
                    let restante = campo.conf.casas;
                    if( a.length === 2 )  {
                        restante = a[1].length >= campo.conf.casas ? 0 : campo.conf.casas - a[1].length ;
                    } else {
                        texto += '.';
                    }
                    texto += "0".repeat( restante );// coloca os zeros que falta para completar a quantidade de casas decimais

                    // troca . por ,
                    texto = texto.replace('.', ',');
                }
                    
                if( campo.conf.unidade ) texto += ' ' + campo.conf.unidade;
            }

            this.printCampoSimplesEmColuna( campo.nome, texto);
        }

        printCampoPO ( campo ) {
            this.printCampoPOTabela( campo );

            if( campo.resposta.nota ) {
                this.printCampoSimples( 'Observações', campo.resposta.nota);
            }
        }

        printCampoPOTabela( campo ) {
            let tabela = {
                table: {
                    widths: [70, 40, 70, 60, 60, 80],
                    body: [
                        [
                            {text: '', colSpan: 2, border: [false, false, false, false]}, {}, 
                            {text: 'Esférico', margin: [0, 10, 0, 0], border: [false, false, false, false]}, 
                            {text: 'Cilindro', margin: [0, 10, 0, 0], border: [false, false, false, false]}, 
                            {text: 'Eixo º', margin: [0, 10, 0, 0], border: [false, false, false, false]}, 
                            {text: 'DPN (mm)', margin: [0, 10, 0, 0], border: [false, false, false, false]}
                        ]
                    ]
                },
                unbreakable: true,// retirado daqui: https://stackoverflow.com/a/52074264/7927197
                layout: this.docDefinicao.tableLayouts['preciscao-oculos']
            };

            // Visão de perto
            if ( campo.resposta.perto ) {
                tabela.table.body.push(
                    [
                        {text: 'Perto', rowSpan: 2, alignment: 'center', margin: [0, 18, 0, 0]}, 
                        {text: 'O.D', style: ['po-content', 'center']}, 
                        { text: campo.resposta.perto.od.esferico || '', style: ['po-content'] }, 
                        { text: campo.resposta.perto.od.cilindro || '', style: ['po-content'] }, 
                        { text: campo.resposta.perto.od.eixo || '', style: ['po-content'] }, 
                        { text: campo.resposta.perto.od.dnp || '', style: ['po-content'] }
                    ],
                    [
                        '', 
                        {text: 'O.E', style: ['po-content', 'center']}, 
                        { text: campo.resposta.perto.oe.esferico || '', style: ['po-content'] }, 
                        { text: campo.resposta.perto.oe.cilindro || '', style: ['po-content'] }, 
                        { text: campo.resposta.perto.oe.eixo || '', style: ['po-content'] }, 
                        { text: campo.resposta.perto.oe.dnp || '', style: ['po-content'] }
                    ]
                );
            }

            // Visão de longe
            if ( campo.resposta.longe ) {
                tabela.table.body.push(
                    [
                        {text: 'Longe', rowSpan: 2, alignment: 'center', margin: [0, 18, 0, 0]}, 
                        {text: 'O.D', style: ['po-content', 'center']}, 
                        { text: campo.resposta.longe.od.esferico || '', style: ['po-content'] }, 
                        { text: campo.resposta.longe.od.cilindro || '', style: ['po-content'] }, 
                        { text: campo.resposta.longe.od.eixo || '', style: ['po-content'] }, 
                        { text: campo.resposta.longe.od.dnp || '', style: ['po-content'] }
                    ],
                    [
                        '', 
                        {text: 'O.E', style: ['po-content', 'center']}, 
                        { text: campo.resposta.longe.oe.esferico || '', style: ['po-content'] }, 
                        { text: campo.resposta.longe.oe.cilindro || '', style: ['po-content'] }, 
                        { text: campo.resposta.longe.oe.eixo || '', style: ['po-content'] }, 
                        { text: campo.resposta.longe.oe.dnp || '', style: ['po-content'] }
                    ]
                );
            }

            this.docDefinicao.content.push( tabela );
        }

        printCampoPA( campo ) {
            var r = '';
            if( campo.resposta.sistolica ) r = campo.resposta.sistolica;
            if( campo.resposta.diastolica ) {
                if( r != '' ) r += '/';
                r += campo.resposta.diastolica;
            }

            if( r != '' ) r += ' mmHg';

            if( campo.resposta.frequencia ) {
                if( r != '' ) r += ', ';
                r += campo.resposta.frequencia  + ' pulso / min';
            }

            if( campo.resposta.status ) {
                if( r != '' ) r += ', ';
                r += `(${campo.resposta.status})`;
            }

            this.printCampoSimplesEmColuna( campo.nome, r);
        }


        /**
         * Formata um número como moeda
         */
        currencyFormat(num) {
            return (
              num
                .toFixed(2) // 2 casas decimais
                .replace('.', ',')
                .replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1.')
            );
        }

        /**
         * Retorna uma imagem no formato base64 do Google Storage
         * Não está em uso
         * 
         * @param {String} arquivo endereço completo da imagem no google storage
         */
        getImagemBase64GoogleStorage( arquivo ) {
            return new Promise( ( resolve, reject ) => {
                let remoteFile = storage.getBucket().file( arquivo );
                // 1º pega os metadados
                remoteFile.getMetadata().then( data => {
                    let tipo = 'image/png';
                    if(data[0].contentType) tipo = data[0].contentType;
                    let stream = remoteFile.createReadStream();

                    let chunks = [];

                    stream.on('data', (chunk) => {
                        chunks.push( chunk );
                    });

                    stream.on('end', () => {
                        let result = Buffer.concat(chunks);
                        resolve( `data:${tipo};base64,` + result.toString('base64') );
                    });

                    stream.on('error', (error) => {
                        reject('erro leitura imagem' );
                    });
                }).catch( erro => {
                    if( erro.code == 404 ) {
                        return reject('não localizado');
                    }
                    reject('error')
                });
            });
        }

        /**
         * Retorna uma imagem no formato base64 do CloudImage.io
         * @param {String} arquivo nome do arquivo da logo
         */
        getLogoEmpresaBase64CloudImage( arquivo ) {
            return new Promise( ( resolve, reject ) => {
                if( !conf.imgCdnUrl || !arquivo ) return reject( 'parametros de configuração não definidos' );
                let url = `${conf.imgCdnUrl}/bound/80x80/n/_empresalogo_/${this.empresaID}/${arquivo}`;

                request.get( url, ( error, response, body ) => {
                    if (!error && response.statusCode == 200) {
                        return resolve( "data:" + response.headers["content-type"] + ";base64," + Buffer.from(body).toString('base64') );
                    }
                    reject( 'erro interno' );
                });
            });
        }

        /**
         * Retorna uma imagem no formato base64 do CloudImage.io
         * @param {String} localArquivo local do arquivo, com o namespace, para prontário: _prontuario_
         * @param {String} arquivo nome do arquivo
         * @param {Integer} width largura da imagem, em pixels
         * @param {Integer|String} height altura em pixels da imagem. Para 'auto' passar 'n'
         */
        getImagemBase64CloudImage( localArquivo, arquivo, width, height ) {
            return new Promise( ( resolve, reject ) => {
                if( !conf.imgCdnUrl || !arquivo ) return reject( 'parametros de configuração não definidos' );
                let url = `${conf.imgCdnUrl}/v7/${localArquivo}/${this.empresaID}/${this.usuario.id}/${arquivo}?w=${width}&h=${height}&func=bound&org_if_sml=1`;

                request.get( url, ( error, response, body ) => {
                    if (!error && response.statusCode == 200) {
                        return resolve( "data:" + response.headers["content-type"] + ";base64," + Buffer.from(body).toString('base64') );
                    }

                    reject( 'erro interno' );
                });
            });
        }

    } // fim classe

    module.exports = Impressao;
}