/* eslint-disable camelcase */
export default interface IGame {
    id: number;
    nm_mandante: string;
    nm_curto_mandante: string;
    mandante_imagem: string;
    nm_visitante: string;
    nm_curto_visitante: string;
    visitante_imagem: string;
    hora: string;
    competicao: string;
    local: string;
    status: string;
    ds_status: string;
    data: string;
    data_completa: string;
    dia_semana: string;
    cam: string | null;
    cat: string | null;
    nr_jogo: string | null;
    ano: string | null;
    mandante: string;
    visitante: string;
    prorrogacao_mandante: string;
    prorrogacao_visitante: string;
    penaltis_mandante: string;
    penaltis_visitante: string;
    escalacao_mandante: string;
    escalacao_visitante: string;
    partner:string | null;
    tournament_ref: string | null;
    ref_id: string | null;
    category: string;
    partner_id: string;
}
