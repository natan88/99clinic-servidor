/*
 * funções uteis para usar em todos o sistema
 * 
 * Autor: Natanael L. Freire
 * Data: 03/03/2015
 */
(function () {
    "use strict";
    const _ = require("underscore"),
    moment = require('moment');

    /*
     * 
     * @param {Object} obj Um objeto que eu quero atualizar, acrescentar novos 'nós'
     * @param {String} keyPath Uma string no formato 'noPai.noFilho'. Essa estring representa o objeto que será acrescentado no 'obj'
     * @param {String} value o valor para ser inserido no 'nó' do objeto
     * @returns {undefined} não retorna nada, já que o objeto que é para ser atualizado é passado como parametro
     */
    function geraObjeto(obj, keyPath, value) {
        if(!_.isArray(keyPath)) {
            keyPath = keyPath.split('.');
        }

        let lastKeyIndex = keyPath.length-1;
        let key;
        for (let i = 0; i < lastKeyIndex; ++ i) {
            key = keyPath[i];
            if (!(key in obj)) obj[key] = {};
            obj = obj[key];
        }
        obj[keyPath[lastKeyIndex]] = value;
     }

    /*
     * trata os erros que a biblioteca Joi gera e devolve de forma pronta 
     * para ser mostrada ao usuário
     * 
     * returnObject = true : retornar os erros em objetos aninhados. Exemplo: app.name, name é no filho de app
     * returnObject = false : retornar os erros em objetos simples. Exemplo: app.name, name não é filho de app, 'app.name' é um nó uníco
     */
    function tratarErroValidacaoJoi(err, returnObject){
        if( !err ) return {};// não tem erro
        if(_.isUndefined(returnObject)) returnObject = false;
        if(!_.isBoolean(returnObject)) returnObject = false;
        
        try {
            let erros = JSON.stringify(err);
            let obj = JSON.parse(erros);
            let errosRetorno = {};
            let m;
            let path;
            let temp;
            
            _.each(obj.details, function(val, key){
                path = val.path;
                // valores baseados nessa página: https://github.com/hapijs/joi/blob/v10.2.0/lib/language.js
                switch (val.type) {
                    case 'any.unknown': m = 'não é permitido'; break;
                    case 'any.invalid': m = 'contém valor inválido'; break;
                    case 'any.empty': m = 'não pode está vazio'; break;
                    case 'any.required': m = 'obrigatório'; break;
                    case 'any.allowOnly': m = `deve ser um dos valores: ${val.context.valids}`; break;
                    //case 'any.default': m = ''; break;
                    
                    case 'array.base': m = `deve ser um array`; break;
                    // case 'array.includes': m = `o item ${val.context.pos} não corresponde a nenhum dos tipos permitidos`; break;
                    case 'array.includes': m = `inválido`; break;
                    //case 'array.includesSingle': m = ``; break;
                    case 'array.includesOne': m = `item ${val.context.pos} falhou, motivo: ${val.context.reason}`; break;
                    //case 'array.includesOneSingle': m = ``; break;
                    //case 'array.includesRequiredUnknowns': m = ``; break;
                    case 'array.includesRequiredKnowns': m = `não contém ${val.context.knownMisses}`; break;
                    //case 'array.includesRequiredBoth': m = ``; break;
                    //case 'array.excludes': m = ``; break;
                    //case 'array.excludesSingle': m = ``; break;
                    case 'array.min': m = `deve conter pelo menos ${val.context.limit} ${val.context.limit > 1 ? ' itens' : ' item'}`; break;
                    case 'array.max': m = `deve conter no máximo ${val.context.limit} ${val.context.limit > 1 ? ' itens' : ' item'}`; break;
                    case 'array.length': m = `deve conter ${val.context.limit} ${val.context.limit > 1 ? ' itens' : ' item'}`; break;
                    //case 'array.ordered': m = ``; break;
                    case 'array.orderedLength': m = `o item na posição ${val.context.pos} falhou, motivo: ${val.context.reason}`; break;
                    case 'array.sparse': m = `o item na posição ${val.context.pos} falhou porque a matriz deve conter no máximo ${val.context.limit > 1 ? ' itens' : ' item'}`; break;
                    // case 'array.unique': m = `item duplicado`; break;//`o item na posição ${val.context.pos} tem valor duplicado`
                    case 'array.unique': m = `item duplicado`; path = val.context.label + '.' + val.context.pos; break;//`o item na posição ${val.context.pos} tem valor duplicado`
                    
                    case 'boolean.base': m = 'deve ser um boleano'; break;
                    
                    case 'date.base': m = 'deve ser um número de milissegundos ou seqüência de data válida'; break;
                    case 'date.format': m = `deve ser uma string com um dos seguintes formatos ${val.context.format}`; break;
                    case 'date.strict': m = 'deve ser uma data válida'; break;
                    case 'date.min': m = `deve ser maior ou igual a ${val.context.limit}`; break;
                    case 'date.max': m = `deve ser menor ou igual a ${val.context.limit}`; break;
                    case 'date.isoDate': m = 'deve ser uma data ISO 8601 válida'; break;
                    case 'date.timestamp.javascript': m = 'deve ser um timestamp válido ou número de milissegundos'; break;
                    case 'date.timestamp.unix': m = 'Ddve ser um timestamp válido ou número de segundos'; break;
                    //case 'date.ref': m = ''; break;
                    
                    //function
                    //lazy
                    
                    case 'object.base': m = 'deve ser um objeto'; break;
                    //case 'object.child': m = ''; break;
                    case 'object.min': temp = val.context.limit > 1 ? 's': ''; m = `deve ter pelo menos ${val.context.limit} filho${temp}`; break;
                    case 'object.max': temp = val.context.limit > 1 ? 's': ''; m = `deve ter menos de ou igual a ${val.context.limit} filho${temp}`; break;
                    case 'object.length': temp = val.context.limit > 1 ? 's': ''; m = `Deve ter ${val.context.limit} filho${temp}`; break;
                    case 'object.allowUnknown': m = `"${val.path}" não é permitido`; break;
                    // case 'object.with': m = `Obrigatório informar "${val.context.peer}"`; path = val.context.peer; break;
                    case 'object.with': m = `Obrigatório`; path = val.context.peer; break;
                    // case 'object.and': m = `Contém o valor "${val.context.present}" sem seu(s) par(es) obrigatório(s) "${val.context.missing}"`; path = val.context.missing[0]; break;
                    case 'object.and': m = `obrigatório quando "${val.context.presentWithLabels[0] || val.context.present}" tiver sido informado`; path = val.context.missing[0]; break;
                    case 'object.missing': m = `deve conter pelo menos um dos valores "${val.context.peers}"`; break;
                    // objetos tem mais itens

                    
                    case 'number.base': m = 'deve ser um número'; break;
                    case 'number.min': m = `deve ser maior ou igual a ${val.context.limit}`; break;
                    case 'number.max': m = `deve ser menor ou igual a ${val.context.limit}`; break;
                    case 'number.less': m = `deve ser inferior a ${val.context.limit}`; break;
                    case 'number.greater': m = `deve ser maior que ${val.context.limit}`; break;
                    case 'number.float': m = 'deve ser um número decimal'; break;
                    case 'number.integer': m = `deve ser um número inteiro`; break;
                    case 'number.negative': m = `deve ser um número negativo`; break;
                    case 'number.positive': m = `deve ser um número positivo`; break;
                    case 'number.precision': m = `não pode ter mais que ${val.context.limit} casas decimais`; break;
                    case 'number.multiple': m = `deve ser múltiplo de ${val.context.multiple}`; break;
                    
                    case 'string.base': m = 'deve ser texto'; break;
                    case 'string.min': temp = val.context.limit > 1 ? 's': ''; m = `deve ter pelo menos ${val.context.limit} caractere${temp}`; break;
                    case 'string.max': temp = val.context.limit > 1 ? 's': ''; m = `não pode ter mais de ${val.context.limit} caractere${temp}`; break;
                    case 'string.length': temp = val.context.limit > 1 ? 's': ''; m = `deve ter exatamente ${val.context.limit} caractere${temp}`; break;
                    case 'string.alphanum':  m = `apenas caracteres alfanuméricos são permitidos`; break;
                    case 'string.token':  m = `apenas caracteres alfanuméricos e sublinhados são permitidos`; break;
                    case 'string.regex.base':  m = `O valor "${val.context.value}" não corresponde ao padrão exigido ${val.context.pattern}`; break;
                    case 'string.regex.name':  m = `${val.context.name}`; break;
                    case 'string.email':  m = `não é e-mail válido`; break;
                    case 'string.uri':  m = `não é uma URL válida`; break;
                    case 'string.uriRelativeOnly':  m = `não é uma URL relativa válida`; break;
                    case 'string.isoDate':  m = 'deve ser uma data ISO 8601 válida'; break;
                    case 'string.guid':  m = 'deve ser um GUID válido'; break;
                    case 'string.hex':  m = 'deve conter apenas caracteres hexadecimais'; break;
                    case 'string.base64':  m = 'deve ser uma string base64 válida'; break;
                    case 'string.hostname':  m = 'deve ser um hostname válido'; break;
                    case 'string.lowercase':  m = 'Deve conter apenas caracteres minúsculos'; break;
                    case 'string.uppercase':  m = 'Deve conter somente caracteres maiúsculos'; break;
                    case 'string.trim':  m = 'não deve ter espaços à esquerda ou à direita'; break;
                    case 'string.creditCard':  m = 'deve ser um número de cartão de crédito válido'; break;
                    //case 'string.ref':  m = `Referências "${val.context.ref}" não é um número`; break;
                    case 'string.ip':  m = 'deve ser um endereço IP válido'; break;
                    case 'string.ipVersion':  m = `deve ser um endereço IP válido de uma das seguintes versões ${val.context.version} com um CIDR ${val.context.cidr}`; break;
                        
                    default: m = val.message;
                }
                
                if(returnObject) {
                    geraObjeto(errosRetorno, path, m);
                }else{
                    errosRetorno[path] = m;
                }
            });
            
            return errosRetorno;
        } catch (e) {
            return {};
        }
    }
    
    /**
     * Gera código único de qualquer tamaho
     * 
     * 
     * @param {int} tamanho o tamnho do código a ser gerado
     * @returns {String} o código gerado
     */
    function codigoUnico(tamanho) {
        var t = tamanho || 5;
        return Math.random().toString(36).substr(2, t);
    }

    function getIdadePaciente( dataNascimento ) {
        if( _.isUndefined( dataNascimento ) || !dataNascimento) {
            return '';
        }
        let agora = moment();
        dataNascimento = moment( dataNascimento.toString(), 'DD/MM/YYYY' );

        let years = agora.diff(dataNascimento, 'year');
        dataNascimento.add(years, 'years');

        let months = agora.diff(dataNascimento, 'months');
        dataNascimento.add(months, 'months');

        let days = agora.diff(dataNascimento, 'days');

        let idade = '', p;
        if( years > 0 ) {
            // p = years == 1 ? '' : 's';
            idade = `${years}A`;
        }

        if( months > 0 ) {
            // p = months == 1 ? 'mês' : 'meses';
            if( idade !== '' ) idade +=', ';
            idade += `${months}M`;
        }

        if( days > 0 ) {
            // p = days == 1 ? 'dia' : 'dias';
            if( idade !== '' ) idade +=', ';
            idade += `${days}D`;
        }
        
        return idade;
    }
    
    exports.tratarErroValidacaoJoi = tratarErroValidacaoJoi;
    exports.codigoUnico = codigoUnico;
    exports.getIdadePaciente = getIdadePaciente;
}());