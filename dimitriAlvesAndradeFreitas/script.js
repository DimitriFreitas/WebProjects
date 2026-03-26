function atualizarHorario() {

    let agora = new Date();

    let dia = agora.getDate();
    let mes = agora.getMonth() + 1;
    let ano = agora.getFullYear();

    let hora = agora.getHours();
    let minuto = agora.getMinutes();
    let segundo = agora.getSeconds();

    if (dia < 10) dia = "0" + dia;
    if (mes < 10) mes = "0" + mes;
    if (hora < 10) hora = "0" + hora;
    if (minuto < 10) minuto = "0" + minuto;
    if (segundo < 10) segundo = "0" + segundo;

    let dataFormatada = dia + "/" + mes + "/" + ano +
                        " " + hora + ":" + minuto + ":" + segundo;

    document.getElementById("relogio").innerHTML = dataFormatada;


 
    let agoraMs = agora.getTime();

    let fimDoDia = new Date();
    fimDoDia.setHours(23);
    fimDoDia.setMinutes(59);
    fimDoDia.setSeconds(59);

    let fimDoDiaMs = fimDoDia.getTime();

    let diferenca = fimDoDiaMs - agoraMs;

    let horasRestantes = Math.floor(diferenca / (1000 * 60 * 60));
    diferenca = diferenca % (1000 * 60 * 60);

    let minutosRestantes = Math.floor(diferenca / (1000 * 60));
    diferenca = diferenca % (1000 * 60);

    let segundosRestantes = Math.floor(diferenca / 1000);

    if (horasRestantes < 10) horasRestantes = "0" + horasRestantes;
    if (minutosRestantes < 10) minutosRestantes = "0" + minutosRestantes;
    if (segundosRestantes < 10) segundosRestantes = "0" + segundosRestantes;

    let tempoRestante = horasRestantes + ":" +
                        minutosRestantes + ":" +
                        segundosRestantes;

    document.getElementById("restante").innerHTML = tempoRestante;
}

window.onload = atualizarHorario;