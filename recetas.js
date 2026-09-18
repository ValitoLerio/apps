/* ══════════════════════════════════════════════════════════════════
   RECETAS — el recetario de trabajo
   ══════════════════════════════════════════════════════════════════
   Pensado para la cocina, no para la estantería:

     Hoy        el menú del día montado: primero, segundo y postre
     Recetas    cada una con sus ingredientes y sus pasos
     Cocinar    un paso cada vez, en letra grande, sin perder el sitio

   Cada receta guarda el día que se hizo por última vez y cuántas veces
   se ha hecho. Al montar un menú avisa si eso se sirvió hace poco, que
   es lo que de verdad se olvida cuando llevas la semana encima.

   Las cantidades se guardan para unas raciones y se recalculan solas
   para las que hagan falta.
   ══════════════════════════════════════════════════════════════════ */
(function(){

var CLAVE = "recetas.libro.v1";

var TIPOS = {
  primero: {nombre:"Primero", corto:"1º",     icono:"🥣"},
  segundo: {nombre:"Segundo", corto:"2º",     icono:"🍖"},
  postre:  {nombre:"Postre",  corto:"Postre", icono:"🍮"},
  base:    {nombre:"Base",    corto:"Base",   icono:"🧂"}
};
var ORDEN_TIPOS = ["primero","segundo","postre","base"];

/* Los catorce de declaración obligatoria. Sirviendo a empresas hay que
   poder decirlos plato a plato y del menú entero. */
var ALERGENOS = {
  gluten:     {nombre:"Gluten",             icono:"🌾"},
  crustaceos: {nombre:"Crustáceos",         icono:"🦐"},
  huevo:      {nombre:"Huevo",              icono:"🥚"},
  pescado:    {nombre:"Pescado",            icono:"🐟"},
  cacahuete:  {nombre:"Cacahuetes",         icono:"🥜"},
  soja:       {nombre:"Soja",               icono:"🫘"},
  lacteos:    {nombre:"Lácteos",            icono:"🥛"},
  frutosSec:  {nombre:"Frutos de cáscara",  icono:"🌰"},
  apio:       {nombre:"Apio",               icono:"🌿"},
  mostaza:    {nombre:"Mostaza",            icono:"🟡"},
  sesamo:     {nombre:"Sésamo",             icono:"⚪"},
  sulfitos:   {nombre:"Sulfitos",           icono:"🍷"},
  altramuces: {nombre:"Altramuces",         icono:"🫛"},
  moluscos:   {nombre:"Moluscos",           icono:"🦑"}
};
var ORDEN_ALERGENOS = ["gluten","crustaceos","huevo","pescado","cacahuete","soja","lacteos",
                       "frutosSec","apio","mostaza","sesamo","sulfitos","altramuces","moluscos"];

/* Cómo encaja el plato en una dieta. Son etiquetas, no una ciencia: las
   pone quien escribe la receta y se filtran por ellas. */
var DIETAS = {
  vegetariana: {nombre:"Vegetariana",  icono:"🥗"},
  vegana:      {nombre:"Vegana",       icono:"🌱"},
  sinGluten:   {nombre:"Sin gluten",   icono:"🚫🌾"},
  sinLactosa:  {nombre:"Sin lactosa",  icono:"🚫🥛"},
  ligero:      {nombre:"Ligero",       icono:"🪶"}
};
var ORDEN_DIETAS = ["vegetariana","vegana","sinGluten","sinLactosa","ligero"];

function dietasDe(r){
  return (r && Array.isArray(r.dieta)) ? r.dieta.filter(function(d){ return DIETAS[d]; }) : [];
}

/* Los valores de una ración. Son aproximados y la app lo dice: sirven
   para comparar platos entre sí, no para una analítica. */
function nutricionDe(r){
  var n=(r && r.nutricion) || {};
  return {kcal:+n.kcal||0, hidratos:+n.hidratos||0,
          proteinas:+n.proteinas||0, grasas:+n.grasas||0};
}
function tieneNutricion(r){
  var n=nutricionDe(r);
  return n.kcal>0 || n.hidratos>0 || n.proteinas>0 || n.grasas>0;
}

function alergenosDe(r){
  return (r && Array.isArray(r.alergenos)) ? r.alergenos.filter(function(a){ return ALERGENOS[a]; }) : [];
}
function chapasAlergenos(lista, tam){
  if(!lista.length) return '<span class="chapa ok">Sin alérgenos declarados</span>';
  return lista.map(function(a){
    return '<span class="chapa aviso"'+(tam?' style="font-size:'+tam+'"':"")+' title="'+
           esc(ALERGENOS[a].nombre)+'">'+ALERGENOS[a].icono+' '+esc(ALERGENOS[a].nombre)+'</span>';
  }).join(" ");
}

var VACIO = {
  recetas: [],
  menus:   [],                      /* {fecha, primero, segundo, postre, nota} */
  ajustes: { raciones: 4, avisarDias: 21 }
};

/* Maneras de hacer un mismo plato. Al escribir el nombre de una receta,
   la app mira aquí y ofrece las que conoce: se elige una y se rellenan
   los ingredientes y los pasos, que es lo pesado de escribir.

   Las claves son lo que se teclea; cada plato lleva sus formas. */
var VARIANTES = {
  "lentejas": [
    {sub:"con chorizo", tipo:"primero", raciones:10, tiempo:"1 h 30 min",
     alergenos:[],
     ing:["1|kg|lentejas","2||cebollas","3||zanahorias","2||patatas","400|g|chorizo",
          "200|g|panceta","4||dientes de ajo","2||hojas de laurel",
          "1|cucharada|pimentón dulce","|aceite de oliva","|sal"],
     pasos:["Pochar la cebolla picada a fuego suave 15 minutos",
       "Añadir el ajo laminado y el chorizo y la panceta en trozos",
       "Apartar del fuego y echar el pimentón, removiendo deprisa",
       "Volver al fuego, añadir las lentejas y el laurel",
       "Cubrir con agua tres dedos por encima",
       "Cocer 40 minutos destapado a fuego bajo",
       "Añadir la zanahoria y la patata cascada; 20 minutos más",
       "Probar de sal al final y dejar reposar"],
     notas:"La sal al final: puesta antes, la piel se endurece y no se abren."},
    {sub:"con verduras", tipo:"primero", raciones:10, tiempo:"1 h 20 min",
     alergenos:[],
     ing:["1|kg|lentejas","2||cebollas","3||zanahorias","2||patatas","1||puerro",
          "1||pimiento rojo","4||dientes de ajo","2||hojas de laurel",
          "1|cucharada|pimentón dulce","|aceite de oliva","|sal"],
     pasos:["Picar la cebolla, el puerro y el pimiento pequeños",
       "Pocharlos a fuego suave 20 minutos, sin que cojan color",
       "Añadir el ajo laminado y dar unas vueltas",
       "Fuera del fuego, el pimentón",
       "Añadir las lentejas y el laurel y cubrir de agua",
       "Cocer 40 minutos y añadir zanahoria y patata cascada",
       "20 minutos más y probar de sal"],
     notas:"Sin carne aguantan mejor de un día para otro."},
    {sub:"estofadas con costilla", tipo:"primero", raciones:10, tiempo:"2 h",
     alergenos:["sulfitos"],
     ing:["1|kg|lentejas","1,5|kg|costilla de cerdo","2||cebollas","3||zanahorias",
          "200|ml|vino blanco","4||dientes de ajo","2||hojas de laurel",
          "1|cucharada|pimentón dulce","|aceite de oliva","|sal"],
     pasos:["Dorar la costilla troceada a fuego fuerte y reservar",
       "Pochar la cebolla y la zanahoria en esa grasa",
       "Fuera del fuego, el pimentón; volver y mojar con el vino",
       "Dejar evaporar el alcohol",
       "Volver la costilla, añadir lentejas, laurel y agua",
       "Cocer 1 hora y cuarto a fuego muy suave",
       "Probar de sal y dejar reposar media hora antes de servir"],
     notas:"La costilla dorada primero es lo que le da el fondo al caldo."}
  ],

  "merluza": [
    {sub:"a la plancha con ajada", tipo:"segundo", raciones:10, tiempo:"25 min",
     alergenos:["pescado","sulfitos"],
     ing:["10||lomos de merluza","8||dientes de ajo","1|cucharada|pimentón dulce",
          "3|cucharadas|vinagre de vino","150|ml|aceite de oliva","|perejil","|sal"],
     pasos:["Secar muy bien los lomos con papel","Salar y esperar 5 minutos",
       "Plancha muy fuerte: 3 minutos la piel, 2 el otro lado",
       "Dorar los ajos laminados en el aceite",
       "Fuera del fuego, el pimentón, y luego el vinagre con cuidado",
       "Volcar la ajada caliente por encima"],
     notas:"La plancha humeando antes de poner el primer lomo."},
    {sub:"en salsa verde", tipo:"segundo", raciones:10, tiempo:"35 min",
     alergenos:["pescado","gluten","sulfitos"],
     ing:["10||lomos de merluza","300|g|almejas","6||dientes de ajo",
          "50|g|harina","200|ml|vino blanco","500|ml|fumet","|perejil",
          "|aceite de oliva","|sal"],
     pasos:["Purgar las almejas en agua con sal media hora",
       "Dorar el ajo picado a fuego suave, sin que tome color",
       "Añadir la harina y cocerla un minuto",
       "Mojar con el vino y el fumet, removiendo para que ligue",
       "Poner los lomos con la piel hacia arriba y las almejas",
       "Mover la cazuela en vaivén 8 minutos, sin remover",
       "Perejil picado al final"],
     notas:"El vaivén de la cazuela es lo que liga la salsa. Removiendo se rompe el pescado."},
    {sub:"al horno con patatas", tipo:"segundo", raciones:10, tiempo:"50 min",
     alergenos:["pescado","sulfitos"],
     ing:["10||lomos de merluza","2|kg|patatas","2||cebollas","200|ml|vino blanco",
          "6||dientes de ajo","|perejil","|aceite de oliva","|sal"],
     pasos:["Cortar la patata en rodajas finas y la cebolla en juliana",
       "Hacerlas en la bandeja del horno a 190° durante 25 minutos",
       "Poner los lomos encima, salados",
       "Regar con el vino, el aceite y el ajo picado",
       "Horno 12 minutos más",
       "Perejil por encima al sacar"],
     notas:"La patata debajo recoge el jugo y es lo mejor del plato."}
  ],

  "pollo": [
    {sub:"al ajillo", tipo:"segundo", raciones:10, tiempo:"45 min",
     alergenos:["sulfitos"],
     ing:["3|kg|pollo troceado","2||cabezas de ajo","250|ml|vino blanco",
          "2||hojas de laurel","|perejil","|aceite de oliva","|sal y pimienta"],
     pasos:["Salpimentar y dejar reposar 10 minutos",
       "Dorar a fuego fuerte por tandas, sin amontonar",
       "Bajar el fuego y echar los ajos enteros pelados",
       "Cuando estén dorados, mojar con el vino",
       "Laurel y 20 minutos a fuego medio","Perejil al final"],
     notas:"Por tandas: amontonado suelta agua y no dora."},
    {sub:"al horno con limón", tipo:"segundo", raciones:10, tiempo:"1 h 10 min",
     alergenos:["sulfitos"],
     ing:["20||muslos de pollo","1,5|kg|patatas","3||limones","2||cabezas de ajo",
          "250|ml|vino blanco","|romero","|aceite de oliva","|sal y pimienta"],
     pasos:["Salpimentar los muslos, mejor la víspera",
       "Patata en rodajas gruesas de cama en la bandeja",
       "Muslos encima con la piel hacia arriba",
       "Ajos sin pelar, limón en rodajas y romero",
       "Regar con el vino y aceite","Horno 200° 50 minutos",
       "220° los últimos 10 para que la piel quede crujiente"],
     notas:""},
    {sub:"en pepitoria", tipo:"segundo", raciones:10, tiempo:"1 h 15 min",
     alergenos:["frutosSec","huevo","sulfitos"],
     ing:["3|kg|pollo troceado","2||cebollas","150|g|almendra cruda","4||huevos",
          "250|ml|vino blanco","1|l|caldo de pollo","|azafrán","6||dientes de ajo",
          "|aceite de oliva","|sal"],
     pasos:["Dorar el pollo salpimentado y reservar",
       "Pochar la cebolla picada en la misma cazuela",
       "Freír aparte las almendras y los ajos, sin quemarlos",
       "Cocer los huevos 10 minutos y separar las yemas",
       "Majar almendra, ajo, yemas y azafrán con un poco de caldo",
       "Volver el pollo, mojar con vino y caldo, cocer 40 minutos",
       "Añadir el majado y cocer 10 minutos más"],
     notas:"El majado al final: si entra pronto se agarra al fondo."}
  ],

  "bacalao": [
    {sub:"con tomate", tipo:"segundo", raciones:10, tiempo:"45 min", alergenos:["pescado"],
     ing:["10||lomos de bacalao desalado","2|kg|tomate triturado","2||cebollas",
          "2||pimientos rojos","1|cucharadita|azúcar","3||dientes de ajo",
          "|aceite de oliva","|sal"],
     pasos:["Escurrir y secar los lomos","Pochar cebolla y pimiento 20 minutos",
       "Añadir el ajo laminado","Echar el tomate y el azúcar; 25 minutos",
       "Probar de sal: el bacalao ya sala",
       "Poner los lomos con la piel arriba, tapar y 8 minutos",
       "Mover la cazuela, no remover"],
     notas:""},
    {sub:"al pil-pil", tipo:"segundo", raciones:10, tiempo:"40 min", alergenos:["pescado"],
     ing:["10||lomos de bacalao desalado","300|ml|aceite de oliva suave",
          "10||dientes de ajo","2||guindillas","|sal"],
     pasos:["Confitar los ajos laminados y la guindilla a fuego muy suave",
       "Sacarlos y reservar","Poner los lomos con la piel hacia abajo",
       "Confitar 8 minutos a fuego muy bajo, que no llegue a freír",
       "Sacar el bacalao y templar el aceite",
       "Ligar el aceite con la gelatina que ha soltado, moviendo en círculos",
       "Volver el bacalao a la salsa ligada"],
     notas:"El aceite templado, nunca caliente: si quema, la salsa se corta."},
    {sub:"a la vizcaína", tipo:"segundo", raciones:10, tiempo:"1 h",
     alergenos:["pescado","sulfitos"],
     ing:["10||lomos de bacalao desalado","8||pimientos choriceros","3||cebollas",
          "100|g|pan frito","200|ml|vino blanco","4||dientes de ajo",
          "|aceite de oliva","|sal"],
     pasos:["Hidratar los choriceros en agua caliente una hora y sacar la carne",
       "Pochar la cebolla muy despacio, 40 minutos, que se deshaga",
       "Añadir el ajo, la carne de choricero y el pan frito",
       "Mojar con el vino y cocer 15 minutos",
       "Triturar y pasar por el chino",
       "Calentar los lomos en la salsa 8 minutos, moviendo la cazuela"],
     notas:"La cebolla muy despacio: ahí está todo el plato."}
  ],

  "arroz": [
    {sub:"paella de pollo y verduras", tipo:"primero", raciones:10, tiempo:"55 min",
     alergenos:["apio"],
     ing:["1|kg|arroz redondo","1,5|kg|pollo troceado","500|g|judía verde plana",
          "300|g|alcachofas","2||tomates","2,5|l|caldo de pollo",
          "1|cucharada|pimentón dulce","|azafrán","|aceite de oliva","|sal"],
     pasos:["Dorar bien el pollo salado","Sofreír la verdura al lado",
       "Tomate rallado y dejar que se sofría","Fuera del fuego, el pimentón",
       "Caldo caliente con azafrán, 10 minutos",
       "Arroz en lluvia, repartir y no tocar más",
       "18 minutos: 8 fuertes y 10 suaves","Tapar con un paño 5 minutos"],
     notas:"Repartido el arroz, no se remueve más."},
    {sub:"caldoso con costilla", tipo:"primero", raciones:10, tiempo:"50 min",
     alergenos:["apio","sulfitos"],
     ing:["800|g|arroz redondo","1,5|kg|costilla de cerdo","2||cebollas",
          "1||pimiento rojo","3,5|l|caldo","2||tomates","100|ml|vino blanco",
          "|pimentón dulce","|aceite de oliva","|sal"],
     pasos:["Dorar la costilla troceada y reservar",
       "Pochar cebolla y pimiento picados","Tomate rallado y sofreír",
       "Fuera del fuego el pimentón; mojar con vino",
       "Volver la costilla y el caldo caliente",
       "Cocer 20 minutos y echar el arroz",
       "18 minutos más; tiene que quedar caldoso, no seco",
       "Servir enseguida, que sigue bebiendo caldo"],
     notas:"Se sirve al momento: en cinco minutos se lo bebe todo."},
    {sub:"a la cubana", tipo:"primero", raciones:10, tiempo:"30 min", alergenos:["huevo"],
     ing:["1|kg|arroz redondo","10||huevos","1|kg|tomate frito","10||plátanos",
          "4||dientes de ajo","|aceite de oliva","|sal"],
     pasos:["Cocer el arroz con los ajos enteros, 16 minutos",
       "Escurrir y refrescar","Calentar el tomate frito",
       "Freír los plátanos abiertos a lo largo",
       "Freír los huevos con puntilla",
       "Montar: arroz en molde, tomate, plátano y huevo"],
     notas:""}
  ],

  "tortilla": [
    {sub:"de patatas", tipo:"segundo", raciones:10, tiempo:"50 min", alergenos:["huevo"],
     ing:["3|kg|patatas","20||huevos","2||cebollas","|aceite de oliva","|sal"],
     pasos:["Patata en láminas finas, no muy regulares",
       "Confitar a fuego medio en abundante aceite","Cebolla en juliana a media fritura",
       "Escurrir muy bien y salar en caliente","Batir los huevos y mezclar",
       "Reposar la mezcla 10 minutos","Cuajar 4 minutos por lado"],
     notas:"Reposar antes de cuajar: la patata bebe el huevo y liga."},
    {sub:"de calabacín y cebolla", tipo:"segundo", raciones:10, tiempo:"40 min",
     alergenos:["huevo"],
     ing:["2|kg|calabacines","20||huevos","3||cebollas","|aceite de oliva","|sal"],
     pasos:["Calabacín en láminas finas, con piel","Pochar con la cebolla a fuego medio",
       "Escurrir bien el aceite, que suelta mucha agua","Salar en caliente",
       "Batir los huevos y mezclar","Cuajar a fuego medio 4 minutos por lado"],
     notas:"Escurrir de verdad: el calabacín es agua y aguará la tortilla."}
  ],

  "flan": [
    {sub:"de huevo", tipo:"postre", raciones:10, tiempo:"1 h + frío",
     alergenos:["huevo","lacteos"],
     ing:["20||huevos","3|l|leche","600|g|azúcar","1||rama de canela",
          "1||piel de limón","200|g|azúcar para el caramelo"],
     pasos:["Caramelo sin remover y forrar los moldes",
       "Infusionar la leche con canela y limón","Batir huevos con azúcar sin montar",
       "Añadir la leche templada en hilo","Colar y llenar los moldes",
       "Baño maría a 160°, 45 minutos","Enfriar 4 horas antes de desmoldar"],
     notas:"Sin montar los huevos: el aire deja agujeros."},
    {sub:"de queso", tipo:"postre", raciones:10, tiempo:"1 h + frío",
     alergenos:["huevo","lacteos"],
     ing:["1|kg|queso crema","14||huevos","2|l|leche","500|g|azúcar",
          "200|g|azúcar para el caramelo"],
     pasos:["Caramelo en los moldes","Batir el queso con el azúcar hasta que quede liso",
       "Añadir los huevos de uno en uno","Incorporar la leche templada",
       "Colar y llenar","Baño maría a 160°, 50 minutos","Enfriar 4 horas"],
     notas:""}
  ],

  "crema": [
    {sub:"de calabacín", tipo:"primero", raciones:10, tiempo:"40 min",
     alergenos:["lacteos","apio"],
     ing:["2|kg|calabacines","2||cebollas","2||patatas","1,5|l|caldo de verduras",
          "200|ml|nata para cocinar","|aceite de oliva","|sal"],
     pasos:["Trocear el calabacín sin pelar","Pochar la cebolla",
       "Añadir la patata y rehogar","Echar el calabacín y cubrir de caldo",
       "20 minutos","Triturar fino","Nata, sal y un hervor corto"],
     notas:""},
    {sub:"de calabaza", tipo:"primero", raciones:10, tiempo:"45 min",
     alergenos:["lacteos","apio"],
     ing:["2,5|kg|calabaza","2||cebollas","2||zanahorias","2||patatas",
          "1,5|l|caldo de verduras","200|ml|nata","|aceite de oliva","|sal","|pimienta"],
     pasos:["Pelar la calabaza y trocearla","Pochar cebolla y zanahoria",
       "Añadir patata y calabaza","Cubrir de caldo y cocer 25 minutos",
       "Triturar muy fino","Nata y pimienta al final"],
     notas:"Asar la calabaza antes al horno concentra el sabor si hay tiempo."},
    {sub:"de puerros (vichyssoise)", tipo:"primero", raciones:10, tiempo:"45 min + frío",
     alergenos:["lacteos"],
     ing:["2|kg|puerros","1,5|kg|patatas","2||cebollas","1,5|l|caldo de ave",
          "400|ml|nata","100|g|mantequilla","|sal y pimienta blanca"],
     pasos:["Usar sólo la parte blanca del puerro, en rodajas",
       "Sudar con la mantequilla sin que coja color, 15 minutos",
       "Añadir patata y caldo","Cocer 25 minutos","Triturar y colar",
       "Añadir la nata y rectificar","Enfriar; se sirve fría"],
     notas:"Sin que coja color: si se dora, deja de ser blanca."}
  ],

  "macarrones": [
    {sub:"a la boloñesa", tipo:"primero", raciones:10, tiempo:"45 min",
     alergenos:["gluten","lacteos","apio","sulfitos"],
     ing:["1|kg|macarrones","800|g|carne picada mixta","2||cebollas","2||zanahorias",
          "1|kg|tomate triturado","150|ml|vino tinto","3||dientes de ajo",
          "200|g|queso rallado","|orégano","|aceite de oliva","|sal"],
     pasos:["Picar muy fina la verdura","Pochar 15 minutos",
       "Dorar la carne deshaciéndola","Vino y dejar evaporar",
       "Tomate y orégano, 30 minutos","Cocer la pasta un minuto menos",
       "Mezclar y queso por encima"],
     notas:"La salsa gana de un día para otro."},
    {sub:"gratinados con bechamel", tipo:"primero", raciones:10, tiempo:"50 min",
     alergenos:["gluten","lacteos"],
     ing:["1|kg|macarrones","1,5|l|bechamel","500|g|jamón cocido","250|g|queso rallado",
          "800|g|tomate frito","|nuez moscada","|sal"],
     pasos:["Cocer la pasta un minuto menos de lo que diga el paquete",
       "Mezclar con el tomate y el jamón en dados",
       "Volcar en la bandeja","Cubrir con la bechamel y el queso",
       "Gratinar 12 minutos"],
     notas:"Un minuto menos: se termina de hacer en el horno."}
  ],

  "albóndigas": [
    {sub:"en salsa de tomate", tipo:"segundo", raciones:10, tiempo:"1 h",
     alergenos:["gluten","huevo","lacteos","sulfitos"],
     ing:["1,5|kg|carne picada mixta","2||huevos","150|g|pan rallado","150|ml|leche",
          "3||cebollas","1|kg|tomate triturado","200|ml|vino blanco","200|g|harina",
          "3||dientes de ajo","|perejil","|aceite de oliva","|sal"],
     pasos:["Remojar el pan rallado en la leche","Mezclar carne, huevo, ajo y perejil",
       "Reposar 20 minutos en cámara","Bolear y enharinar",
       "Freír sólo para dorar","Pochar cebolla, añadir tomate y vino",
       "Cocer la salsa 20 minutos y triturarla",
       "Albóndigas dentro, 15 minutos a fuego suave"],
     notas:"Se terminan en la salsa: fritas del todo salen secas."},
    {sub:"con guisantes y almendras", tipo:"segundo", raciones:10, tiempo:"1 h 10 min",
     alergenos:["gluten","huevo","lacteos","frutosSec","sulfitos"],
     ing:["1,5|kg|carne picada mixta","2||huevos","150|g|pan rallado","150|ml|leche",
          "600|g|guisantes","100|g|almendra cruda","2||cebollas","200|ml|vino blanco",
          "1|l|caldo","200|g|harina","|aceite de oliva","|sal"],
     pasos:["Hacer y freír las albóndigas como siempre",
       "Pochar la cebolla muy picada","Majar la almendra frita con ajo y perejil",
       "Mojar con vino y caldo","Echar las albóndigas y cocer 20 minutos",
       "Añadir los guisantes y el majado, 8 minutos más"],
     notas:"Los guisantes al final, que si no se deshacen."}
  ]
};

/* Busca formas de hacer lo que se está escribiendo. Basta con que el
   nombre contenga la palabra: «lentejas de la casa» encuentra las
   lentejas. */
function variantesPara(nombre){
  var t=String(nombre||"").trim().toLowerCase();
  if(t.length<3) return null;
  var claves=Object.keys(VARIANTES);
  for(var i=0;i<claves.length;i++){
    if(t.indexOf(claves[i])>=0) return {clave:claves[i], formas:VARIANTES[claves[i]]};
  }
  return null;
}

/* «400|g|lentejas» o «|sal» para lo que va al gusto */
function ingredienteDeTexto(t){
  var p=String(t).split("|");
  if(p.length===2) return {cantidad:"", unidad:"", que:p[1]};
  return {cantidad:p[0].replace(",","."), unidad:p[1], que:p[2]};
}

var libro = null;
var ui = { vista:"hoy", dia:null, tipo:"todos", dieta:"", busca:"", receta:null,
           raciones:null, paso:0, hechos:{} };

/* ══════════════════════════════════════════════════════════════
   UTILIDADES
   ══════════════════════════════════════════════════════════════ */
function r2(n){ return Math.round((+n||0)*100)/100; }
function uid(){ return Math.random().toString(36).slice(2)+Date.now().toString(36); }
function esc(t){
  return String(t==null?"":t).replace(/[&<>"']/g, function(c){
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];
  });
}
function num(n, dec){
  var v=+n||0;
  if(dec==null) dec = (Math.abs(v-Math.round(v))<0.005) ? 0 : 2;
  return v.toLocaleString("es-ES",{minimumFractionDigits:dec, maximumFractionDigits:dec});
}
function plural(n, uno, varios){ return n+" "+(n===1?uno:varios); }
function hoyISO(){
  var d=new Date();
  return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
}
function dmy(f){
  if(!f) return "";
  var p=String(f).split("-");
  return p[2]+"/"+p[1]+"/"+p[0];
}
function diaLargo(f){
  if(!f) return "";
  var d=new Date(f+"T12:00:00");
  return d.toLocaleDateString("es-ES",{weekday:"long", day:"numeric", month:"long"});
}
function diasDesde(f){
  if(!f) return null;
  var a=new Date(f+"T12:00:00"), b=new Date(hoyISO()+"T12:00:00");
  return Math.round((b-a)/86400000);
}
function haceCuanto(f){
  var d=diasDesde(f);
  if(d==null) return "nunca";
  if(d<=0) return "hoy";
  if(d===1) return "ayer";
  if(d<7)  return "hace "+d+" días";
  if(d<31) return "hace "+Math.round(d/7)+" semanas";
  if(d<365) return "hace "+Math.round(d/30)+" meses";
  return "hace más de un año";
}
function valor(id){ var e=document.getElementById(id); return e?e.value.trim():""; }
function numero(id){ var e=document.getElementById(id); return e?(+e.value||0):0; }

function avisar(texto, malo){
  var v=document.getElementById("avisoFlot"); if(v) v.remove();
  var d=document.createElement("div");
  d.id="avisoFlot"; d.className="aviso-flotante"+(malo?" malo":"");
  d.textContent=texto;
  document.body.appendChild(d);
  setTimeout(function(){ if(d.parentNode) d.remove(); }, 3200);
}

function abrirVentana(titulo, cuerpoHTML, alGuardar, opciones){
  opciones=opciones||{};
  var vieja=document.getElementById("dlg"); if(vieja) vieja.remove();
  var d=document.createElement("dialog"); d.id="dlg";
  d.innerHTML='<div class="dlg-cab"><h3>'+esc(titulo)+'</h3>'+
              '<button class="btn suave" data-x>Cerrar</button></div>'+
              '<div class="dlg-cuerpo">'+cuerpoHTML+'</div>'+
              '<div class="dlg-pie">'+(opciones.extra||"")+
              '<button class="btn" data-x>Cancelar</button>'+
              '<button class="btn '+(opciones.malo?"malo":"fuerte")+'" data-ok>'+
              esc(opciones.aceptar||"Guardar")+'</button></div>';
  document.body.appendChild(d);
  d.querySelectorAll("[data-x]").forEach(function(b){
    b.addEventListener("click", function(){ d.close(); d.remove(); });
  });
  d.querySelector("[data-ok]").addEventListener("click", function(){
    if(alGuardar()===true) return;
    d.close(); d.remove();
  });
  d.showModal();
  var primero=d.querySelector("input,select,textarea"); if(primero) primero.focus();
  return d;
}
function confirmar(titulo, cuerpo, alAceptar, opciones){
  opciones=opciones||{};
  abrirVentana(titulo, cuerpo, function(){ alAceptar(); },
               {aceptar:opciones.aceptar||"Aceptar", malo:opciones.malo});
}

/* ══════════════════════════════════════════════════════════════
   GUARDAR Y CARGAR
   ══════════════════════════════════════════════════════════════ */
function cargar(){
  try{
    var crudo=localStorage.getItem(CLAVE);
    libro = crudo ? JSON.parse(crudo) : JSON.parse(JSON.stringify(VACIO));
  }catch(e){ libro=JSON.parse(JSON.stringify(VACIO)); }
  if(!libro.recetas) libro.recetas=[];
  if(!libro.menus)   libro.menus=[];
  if(!libro.ajustes) libro.ajustes={};
  if(!libro.ajustes.raciones)   libro.ajustes.raciones=4;
  if(!libro.ajustes.avisarDias) libro.ajustes.avisarDias=21;
}
function guardar(){ localStorage.setItem(CLAVE, JSON.stringify(libro)); }

/* ══════════════════════════════════════════════════════════════
   LAS RECETAS
   ══════════════════════════════════════════════════════════════ */
function recetas(){ return libro.recetas||[]; }
function recetaDe(id){
  return recetas().filter(function(r){ return r.id===id; })[0] || null;
}
function delTipo(t){ return recetas().filter(function(r){ return r.tipo===t; }); }

/* Las cantidades se guardan para las raciones de la receta y se estiran
   para las que se vayan a hacer. Lo que no lleva número —«sal», «un
   chorro de aceite»— se queda como está: multiplicar eso no significa
   nada. */
function escalarNum(ing, raciones, base){
  var c = +ing.cantidad;
  if(ing.cantidad==="" || ing.cantidad==null || isNaN(c)) return null;
  var factor = (base>0 && raciones>0) ? raciones/base : 1;
  return r2(c*factor);
}
/* Para enseñarla. Aparte del número, porque escrita con coma decimal ya
   no vale para sumar: media ración de leche se perdía por el camino. */
function escalar(ing, raciones, base){
  var v=escalarNum(ing, raciones, base);
  return v==null ? "" : num(v);
}

function menuDe(fecha){
  return (libro.menus||[]).filter(function(m){ return m.fecha===fecha; })[0] || null;
}
function fijarMenu(fecha, cambios){
  var m=menuDe(fecha);
  if(!m){ m={fecha:fecha}; libro.menus.push(m); }
  Object.keys(cambios).forEach(function(k){ m[k]=cambios[k]; });
  guardar();
}

/* Cuándo se sirvió por última vez, mirando los menús ya montados y lo
   que diga la receta. Sirve para no repetir plato sin darse cuenta. */
function ultimaVez(recetaId, antesDe){
  var r=recetaDe(recetaId);
  var fechas=[];
  if(r && r.ultima) fechas.push(r.ultima);
  (libro.menus||[]).forEach(function(m){
    if(antesDe && m.fecha>=antesDe) return;
    ORDEN_TIPOS.forEach(function(t){ if(m[t]===recetaId) fechas.push(m.fecha); });
  });
  fechas.sort();
  return fechas.length ? fechas[fechas.length-1] : null;
}

function marcarHecha(recetaId, fecha){
  var r=recetaDe(recetaId); if(!r) return;
  r.ultima=fecha||hoyISO();
  r.veces=(+r.veces||0)+1;
  guardar();
}

/* ══════════════════════════════════════════════════════════════
   ARMAZÓN
   ══════════════════════════════════════════════════════════════ */
function pintar(){
  var root=document.getElementById("root");
  root.innerHTML=
    '<nav class="rail">'+
      '<div class="marca"><span class="nom">Recetas</span>'+
        '<span class="sub">El recetario de trabajo</span></div>'+
      boton("hoy","Hoy", null)+
      boton("recetario","Recetario", recetas().length)+
      boton("semana","La semana", null)+
      boton("ajustes","Ajustes", null)+
      '<div class="pie-rail">'+
        '<span style="font-size:11px;color:var(--muted)">Guardado en GitHub</span>'+
        '<a href="index.html">← Escritorio</a>'+
      '</div>'+
    '</nav>'+
    '<main id="main"></main>';

  root.querySelectorAll("[data-vista]").forEach(function(b){
    b.addEventListener("click", function(){
      ui.vista=b.dataset.vista; ui.receta=null; ui.busca=""; pintar();
    });
  });

  if(ui.receta)                   verReceta();
  else if(ui.vista==="hoy")       verHoy();
  else if(ui.vista==="recetario") verRecetario();
  else if(ui.vista==="semana")    verSemana();
  else                            verAjustes();
}

function boton(vista, texto, cuenta){
  return '<button class="nav" data-vista="'+vista+'"'+
         (ui.vista===vista?' aria-current="true"':'')+'>'+
         '<span>'+esc(texto)+'</span>'+
         (cuenta!=null?'<span class="cuenta">'+cuenta+'</span>':'')+'</button>';
}

function cabecera(titulo, texto, botones){
  return '<div class="cabecera"><div><h1>'+esc(titulo)+'</h1>'+
         '<p>'+texto+'</p></div>'+
         '<div style="display:flex;gap:8px;flex-wrap:wrap">'+(botones||"")+'</div></div>';
}

/* ══════════════════════════════════════════════════════════════
   HOY: EL MENÚ DEL DÍA
   ══════════════════════════════════════════════════════════════ */
function verHoy(){
  var main=document.getElementById("main");
  var fecha=ui.dia||hoyISO();
  var m=menuDe(fecha)||{};

  main.innerHTML=
    cabecera("Menú de "+diaLargo(fecha),
      "Monta el menú y cocínalo paso a paso. Al darle a «hecho» queda apuntada la fecha, "+
      "y la próxima vez que lo pongas te dirá cuánto hace que se sirvió.",
      '<input type="date" id="h_fecha" value="'+esc(fecha)+'" style="width:auto">'+
      '<button class="btn" id="h_compra">Lo que hace falta</button>')+

    '<div class="rejilla" style="grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px">'+
      ["primero","segundo","postre"].map(function(t){ return platoDelMenu(t, m, fecha); }).join("")+
    '</div>'+

    /* Lo que suma el menú entero: cada vez preguntan más, y con los tres
       platos por separado no se sabe. */
    (function(){
      var t={kcal:0, hidratos:0, proteinas:0, grasas:0}, hay=false, faltan=[];
      ["primero","segundo","postre"].forEach(function(k){
        var r=recetaDe(m[k]); if(!r) return;
        if(tieneNutricion(r)){
          hay=true;
          var n=nutricionDe(r);
          t.kcal+=n.kcal; t.hidratos+=n.hidratos;
          t.proteinas+=n.proteinas; t.grasas+=n.grasas;
        } else faltan.push(r.nombre);
      });
      if(!hay) return "";
      return '<div class="cifras" style="margin-top:16px">'+
        '<div class="cifra"><div class="k">Calorías del menú</div>'+
          '<div class="v acento">'+num(t.kcal,0)+'</div><div class="n">kcal por comensal</div></div>'+
        '<div class="cifra"><div class="k">Hidratos</div>'+
          '<div class="v">'+num(t.hidratos,0)+' g</div></div>'+
        '<div class="cifra"><div class="k">Proteínas</div>'+
          '<div class="v">'+num(t.proteinas,0)+' g</div></div>'+
        '<div class="cifra"><div class="k">Grasas</div>'+
          '<div class="v">'+num(t.grasas,0)+' g</div></div>'+
      '</div>'+
      (faltan.length
        ? '<p class="nota" style="margin:-8px 0 0">Sin contar '+esc(faltan.join(" ni "))+
          ', que no '+(faltan.length===1?"tiene":"tienen")+' valores puestos.</p>'
        : "");
    })()+

    /* Los alérgenos del menú entero: es lo que hay que saber decir
       cuando preguntan en la mesa, sin ir plato por plato. */
    (function(){
      var puestos=[], porPlato=[];
      ["primero","segundo","postre"].forEach(function(t){
        var r=recetaDe(m[t]); if(!r) return;
        var suyos=alergenosDe(r);
        porPlato.push({plato:TIPOS[t].nombre, nombre:r.nombre, lista:suyos});
        suyos.forEach(function(a){ if(puestos.indexOf(a)<0) puestos.push(a); });
      });
      if(!porPlato.length) return "";
      puestos.sort(function(a,b){ return ORDEN_ALERGENOS.indexOf(a)-ORDEN_ALERGENOS.indexOf(b); });
      return '<div class="tarjeta" style="margin-top:16px"><div class="tarjeta-cab">'+
        '<h2>Alérgenos del menú</h2>'+
        '<span class="pista">Lo que hay que poder decir si preguntan</span></div>'+
        '<div class="tarjeta-cuerpo">'+
          '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px">'+
            chapasAlergenos(puestos)+'</div>'+
          '<div class="tabla-caja"><table><tbody>'+
            porPlato.map(function(x){
              return '<tr><td style="white-space:nowrap"><strong>'+esc(x.plato)+'</strong>'+
                '<div class="nota" style="margin:0">'+esc(x.nombre)+'</div></td>'+
                '<td>'+(x.lista.length
                  ? x.lista.map(function(a){ return ALERGENOS[a].icono+" "+esc(ALERGENOS[a].nombre); }).join(" · ")
                  : '<span style="color:var(--muted)">sin declarar</span>')+'</td></tr>';
            }).join("")+
          '</tbody></table></div>'+
          (porPlato.some(function(x){ return !x.lista.length; })
            ? '<p class="nota" style="margin:10px 0 0">Los que salen «sin declarar» es que no '+
              'les has marcado nada en su ficha. Sin marcar no quiere decir que no lleven.</p>'
            : "")+
        '</div></div>';
    })()+

    '<div class="tarjeta" style="margin-top:16px"><div class="tarjeta-cab">'+
      '<h2>Nota del día</h2><span class="pista">Lo que quieras recordar</span></div>'+
      '<div class="tarjeta-cuerpo">'+
        '<input id="h_nota" value="'+esc(m.nota||"")+'" '+
        'placeholder="Vienen 40, la mitad sin gluten…"></div></div>';

  document.getElementById("h_fecha").addEventListener("change", function(){
    ui.dia=this.value||hoyISO(); pintar();
  });
  document.getElementById("h_nota").addEventListener("change", function(){
    fijarMenu(fecha, {nota:this.value.trim()}); avisar("Nota guardada");
  });
  document.getElementById("h_compra").addEventListener("click", function(){ verLoQueHaceFalta(fecha); });

  main.querySelectorAll("[data-elegir]").forEach(function(b){
    b.addEventListener("click", function(){ elegirPlato(b.dataset.elegir, fecha); });
  });
  main.querySelectorAll("[data-quitar]").forEach(function(b){
    b.addEventListener("click", function(){
      var cambio={}; cambio[b.dataset.quitar]=""; fijarMenu(fecha, cambio); pintar();
    });
  });
  main.querySelectorAll("[data-cocinar]").forEach(function(b){
    b.addEventListener("click", function(){ abrirCocina(b.dataset.cocinar); });
  });
  main.querySelectorAll("[data-hecho]").forEach(function(b){
    b.addEventListener("click", function(){
      marcarHecha(b.dataset.hecho, fecha);
      pintar(); avisar("Apuntado: hecho el "+dmy(fecha));
    });
  });
}

function platoDelMenu(tipo, m, fecha){
  var info=TIPOS[tipo];
  var r=recetaDe(m[tipo]);
  if(!r){
    return '<div class="tarjeta"><div class="tarjeta-cab"><h2>'+info.icono+' '+esc(info.nombre)+'</h2></div>'+
      '<div class="tarjeta-cuerpo">'+
        '<div class="vacio" style="padding:22px 12px"><strong>Sin elegir</strong>'+
        'Pulsa y busca entre tus recetas.</div>'+
        '<button class="btn fuerte" data-elegir="'+tipo+'" style="margin-top:12px;width:100%">'+
        'Elegir '+esc(info.nombre.toLowerCase())+'</button>'+
      '</div></div>';
  }

  var ultima=ultimaVez(r.id, fecha);
  var dias=ultima?Math.round((new Date(fecha+"T12:00:00")-new Date(ultima+"T12:00:00"))/86400000):null;
  var repetido = dias!=null && dias>=0 && dias < (+libro.ajustes.avisarDias||21);

  return '<div class="tarjeta"><div class="tarjeta-cab"><h2>'+info.icono+' '+esc(info.nombre)+'</h2>'+
    '<button class="btn suave sm malo" data-quitar="'+tipo+'" title="Quitarlo del menú">✕</button></div>'+
    '<div class="tarjeta-cuerpo">'+
      '<div style="font-family:var(--titulo);font-size:19px;font-weight:600;line-height:1.2">'+
        esc(r.nombre)+'</div>'+
      '<div class="nota" style="margin:6px 0 0">'+
        (r.tiempo?esc(r.tiempo)+' · ':"")+
        plural(+r.pasos?r.pasos.length:(r.pasos||[]).length,"paso","pasos")+' · '+
        plural((r.ingredientes||[]).length,"ingrediente","ingredientes")+'</div>'+
      (ultima
        ? '<div style="margin-top:8px"><span class="chapa '+(repetido?"aviso":"neutra")+'">'+
          (repetido?"⚠︎ ":"")+'Servido '+haceCuanto(ultima)+'</span></div>'
        : '<div style="margin-top:8px"><span class="chapa ok">Nunca servido</span></div>')+
      (repetido
        ? '<p class="nota" style="margin:8px 0 0;color:var(--aviso)">'+
          (dias===0 ? 'Ya se ha servido hoy.'
           : dias===1 ? 'Se sirvió ayer.'
           : 'Hace sólo '+dias+' días que se sirvió.')+
          ' Si no quieres repetir tan pronto, cámbialo.</p>'
        : "")+
      '<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">'+
        '<button class="btn fuerte" data-cocinar="'+r.id+'">Cocinar</button>'+
        '<button class="btn" data-hecho="'+r.id+'">Hecho</button>'+
        '<button class="btn suave sm" data-elegir="'+tipo+'">Cambiar</button>'+
      '</div>'+
    '</div></div>';
}

/* Elegir un plato: buscador sobre las recetas de ese tipo, y las de
   cualquier tipo por si un primero sirve de segundo. */
function elegirPlato(tipo, fecha){
  var elegido="";
  var d=abrirVentana("Elegir "+TIPOS[tipo].nombre.toLowerCase(),
    '<div class="campo" style="margin-bottom:10px">'+
      '<label class="lbl" for="el_busca">Buscar en tus recetas</label>'+
      '<input id="el_busca" placeholder="lentejas, merluza, flan…" autocomplete="off"></div>'+
    '<div id="el_lista"></div>',
    function(){
      if(!elegido){ avisar("Elige una receta.", true); return true; }
      var cambio={}; cambio[tipo]=elegido;
      fijarMenu(fecha, cambio);
      pintar(); avisar(TIPOS[tipo].nombre+": "+recetaDe(elegido).nombre);
    }, {aceptar:"Ponerlo en el menú"});

  var busca=document.getElementById("el_busca");
  var caja=document.getElementById("el_lista");

  function pintarOpciones(){
    /* Sólo las de ese tipo: un postre no se pone de segundo. Si hace
       falta, se cambia el tipo en la ficha de la receta. */
    var t=busca.value.trim().toLowerCase();
    var suyas=recetas().filter(function(r){ return r.tipo===tipo; });
    function filtra(l){
      if(!t) return l;
      return l.filter(function(r){
        return (r.nombre+" "+(r.notas||"")).toLowerCase().indexOf(t)>=0; });
    }
    function bloque(titulo, lista){
      if(!lista.length) return "";
      return '<div class="lbl" style="margin:10px 0 6px">'+esc(titulo)+'</div>'+
        lista.slice(0,14).map(function(r){
          var ultima=ultimaVez(r.id, fecha);
          return '<button type="button" data-pick="'+esc(r.id)+'" '+
            'style="display:block;width:100%;text-align:left;border:1px solid '+
            (elegido===r.id?"var(--acento)":"var(--linea)")+';background:'+
            (elegido===r.id?"var(--acento-suave)":"transparent")+';border-radius:8px;'+
            'padding:8px 11px;margin-bottom:6px;cursor:pointer;font:inherit;color:inherit">'+
            '<strong>'+esc(r.nombre)+'</strong>'+
            '<span style="color:var(--muted);font-size:12px"> · '+
            (ultima?"servido "+haceCuanto(ultima):"nunca servido")+'</span></button>';
        }).join("");
    }
    var htmlSuyas=bloque(TIPOS[tipo].nombre+"s", filtra(suyas));
    caja.innerHTML = htmlSuyas ||
      '<p class="nota" style="margin:0">'+
      (suyas.length
        ? 'Ninguno de tus '+esc(TIPOS[tipo].nombre.toLowerCase())+'s se llama así.'
        : 'Todavía no tienes ningún '+esc(TIPOS[tipo].nombre.toLowerCase())+'. '+
          'Dalo de alta en el Recetario.')+'</p>';
    caja.querySelectorAll("[data-pick]").forEach(function(b){
      b.addEventListener("click", function(){ elegido=b.dataset.pick; pintarOpciones(); });
    });
  }
  busca.addEventListener("input", pintarOpciones);
  busca.addEventListener("keydown", function(e){ if(e.key==="Enter"){ e.preventDefault(); e.stopPropagation(); } });
  pintarOpciones();
}

/* Todo lo que hay que tener para el menú del día, junto y sumado por
   ingrediente: es la lista que se lleva a la cámara. */
function verLoQueHaceFalta(fecha){
  var m=menuDe(fecha)||{};
  var raciones=ui.raciones||libro.ajustes.raciones||4;
  var juntos={};
  var platos=[];

  ORDEN_TIPOS.forEach(function(t){
    var r=recetaDe(m[t]); if(!r) return;
    platos.push(r.nombre);
    (r.ingredientes||[]).forEach(function(ing){
      var clave=(ing.que||"").trim().toLowerCase()+"|"+(ing.unidad||"").trim().toLowerCase();
      if(!juntos[clave]) juntos[clave]={que:ing.que, unidad:ing.unidad, cantidad:0, suelto:[]};
      var c=escalarNum(ing, raciones, +r.raciones||raciones);
      if(c==null) juntos[clave].suelto.push(r.nombre);
      else juntos[clave].cantidad=r2(juntos[clave].cantidad+c);
    });
  });

  var claves=Object.keys(juntos);
  abrirVentana("Lo que hace falta · "+diaLargo(fecha),
    (platos.length
      ? '<p class="nota" style="margin:0 0 12px">Para <strong>'+plural(raciones,"ración","raciones")+
        '</strong> de '+esc(platos.join(", "))+'. Las cantidades salen ya estiradas.</p>'+
        '<div class="tabla-caja"><table><tbody>'+
        claves.sort().map(function(k){
          var i=juntos[k];
          return '<tr><td>'+esc(i.que)+
            (i.suelto.length?'<div class="nota" style="margin:0">al gusto, en '+
              esc(i.suelto.join(" y "))+'</div>':"")+'</td>'+
            '<td class="num">'+(i.cantidad>0?num(i.cantidad)+" "+esc(i.unidad||""):"—")+'</td></tr>';
        }).join("")+'</tbody></table></div>'
      : '<div class="vacio"><strong>El menú está vacío</strong>'+
        'Elige al menos un plato y aquí verás todo lo que hace falta.</div>'),
    function(){}, {aceptar:"Cerrar"});
}

/* ══════════════════════════════════════════════════════════════
   EL RECETARIO
   ══════════════════════════════════════════════════════════════ */
function verRecetario(){
  var main=document.getElementById("main");
  var t=ui.busca.trim().toLowerCase();
  var lista=recetas().filter(function(r){
    if(ui.tipo!=="todos" && r.tipo!==ui.tipo) return false;
    if(ui.dieta && dietasDe(r).indexOf(ui.dieta)<0) return false;
    if(!t) return true;
    return (r.nombre+" "+(r.notas||"")+" "+
            (r.ingredientes||[]).map(function(i){ return i.que; }).join(" ")).toLowerCase().indexOf(t)>=0;
  }).sort(function(a,b){ return a.nombre.localeCompare(b.nombre,"es"); });

  main.innerHTML=
    cabecera("Recetario",
      "Cada receta con sus ingredientes y sus pasos. Busca también por ingrediente: "+
      "escribe «merluza» y salen todas las que la llevan.",
      '<button class="btn fuerte" id="nuevaReceta">+ Nueva receta</button>')+

    '<div class="filtros">'+
      '<div class="grupo">'+
        ['todos'].concat(ORDEN_TIPOS).map(function(k){
          var etiqueta = k==="todos" ? "Todas" : TIPOS[k].nombre+"s";
          var n = k==="todos" ? recetas().length : delTipo(k).length;
          return '<button data-tipo="'+k+'" aria-pressed="'+(ui.tipo===k)+'">'+
                 esc(etiqueta)+(n?' <span style="opacity:.6">'+n+'</span>':"")+'</button>';
        }).join("")+
      '</div>'+
      '<input class="buscador" id="r_busca" placeholder="Buscar por nombre o ingrediente…" '+
        'value="'+esc(ui.busca)+'">'+
    '</div>'+

    /* Segunda fila: las dietas. Aparte de los tipos, porque se cruzan:
       se puede querer un primero vegetariano. */
    '<div class="filtros" style="margin-top:-6px">'+
      '<div class="grupo">'+
        [""].concat(ORDEN_DIETAS).map(function(k){
          var etiqueta = k==="" ? "Cualquiera" : DIETAS[k].icono+" "+DIETAS[k].nombre;
          var n = k==="" ? recetas().length
                         : recetas().filter(function(r){ return dietasDe(r).indexOf(k)>=0; }).length;
          return '<button data-dieta="'+k+'" aria-pressed="'+(ui.dieta===k)+'">'+
                 esc(etiqueta)+(n?' <span style="opacity:.6">'+n+'</span>':"")+'</button>';
        }).join("")+
      '</div>'+
    '</div>'+

    (lista.length
      ? (ui.tipo!=="todos"
          /* Con un tipo elegido no hace falta separar nada */
          ? '<div class="fichas">'+lista.map(fichaReceta).join("")+'</div>'
          /* En «Todas», por su orden de menú: primero, segundo y postre.
             Alfabético todo junto mezclaba el flan con las albóndigas. */
          : ORDEN_TIPOS.map(function(t){
              var suyas=lista.filter(function(r){ return r.tipo===t; });
              if(!suyas.length) return "";
              return '<div class="grupoTipo">'+TIPOS[t].icono+' '+esc(TIPOS[t].nombre)+'s'+
                     '<span>'+plural(suyas.length,"receta","recetas")+'</span></div>'+
                     '<div class="fichas" style="margin-bottom:22px">'+
                     suyas.map(fichaReceta).join("")+'</div>';
            }).join(""))
      : '<div class="vacio"><strong>'+
        (recetas().length?"Nada con esa búsqueda":"Todavía no hay recetas")+'</strong>'+
        (recetas().length?"Prueba con otra palabra.":"Dale a «Nueva receta» y empieza por la que más hagas.")+
        '</div>');

  document.getElementById("nuevaReceta").addEventListener("click", function(){ editarReceta(null); });
  main.querySelectorAll("[data-tipo]").forEach(function(b){
    b.addEventListener("click", function(){ ui.tipo=b.dataset.tipo; pintar(); });
  });
  main.querySelectorAll("[data-dieta]").forEach(function(b){
    b.addEventListener("click", function(){ ui.dieta=b.dataset.dieta; pintar(); });
  });
  var busca=document.getElementById("r_busca");
  busca.addEventListener("input", function(){ ui.busca=busca.value; verRecetario();
    var v=document.getElementById("r_busca"); if(v){ v.focus(); v.selectionStart=v.value.length; } });
  main.querySelectorAll("[data-abrir]").forEach(function(b){
    b.addEventListener("click", function(){ ui.receta=b.dataset.abrir; ui.paso=0; ui.hechos={}; pintar(); });
  });
}

function fichaReceta(r){
  var ultima=ultimaVez(r.id);
  var info=TIPOS[r.tipo]||TIPOS.base;
  return '<button class="receta" data-abrir="'+esc(r.id)+'">'+
    '<span class="chapa acento" style="align-self:flex-start">'+info.icono+' '+esc(info.corto)+'</span>'+
    '<span class="nom">'+esc(r.nombre)+'</span>'+
    '<span class="meta">'+
      (r.raciones?plural(+r.raciones,"ración","raciones"):"sin raciones")+
      (r.tiempo?' · '+esc(r.tiempo):"")+'</span>'+
    '<span class="pie">'+
      '<span class="chapa neutra">'+plural((r.pasos||[]).length,"paso","pasos")+'</span>'+
      (ultima?'<span class="chapa neutra">'+esc(haceCuanto(ultima))+'</span>'
             :'<span class="chapa ok">nueva</span>')+
      ((+r.veces||0)>0?'<span class="chapa neutra">'+plural(+r.veces,"vez","veces")+'</span>':"")+
      (tieneNutricion(r)
        ? '<span class="chapa neutra" title="Por ración">'+num(nutricionDe(r).kcal,0)+' kcal</span>'
        : "")+
      dietasDe(r).filter(function(d){ return d==="vegetariana"||d==="vegana"; })
        .map(function(d){ return '<span class="chapa ok">'+DIETAS[d].icono+'</span>'; }).join("")+
      (alergenosDe(r).length
        ? '<span class="chapa aviso" title="'+
          esc(alergenosDe(r).map(function(a){ return ALERGENOS[a].nombre; }).join(", "))+'">'+
          alergenosDe(r).map(function(a){ return ALERGENOS[a].icono; }).join("")+'</span>'
        : "")+
    '</span></button>';
}

/* ══════════════════════════════════════════════════════════════
   UNA RECETA
   ══════════════════════════════════════════════════════════════ */
function verReceta(){
  var main=document.getElementById("main");
  var r=recetaDe(ui.receta);
  if(!r){ ui.receta=null; return pintar(); }

  var base=+r.raciones||libro.ajustes.raciones||4;
  var raciones=ui.raciones||base;
  var ultima=ultimaVez(r.id);
  var info=TIPOS[r.tipo]||TIPOS.base;

  main.innerHTML=
    '<button class="btn suave sm" id="volver" style="margin-bottom:12px">← Recetario</button>'+
    cabecera(r.nombre,
      info.icono+' '+esc(info.nombre)+
      (r.tiempo?' · '+esc(r.tiempo):"")+
      ' · '+(ultima?"hecha "+esc(haceCuanto(ultima)):"nunca la has hecho")+
      ((+r.veces||0)>0?' · '+plural(+r.veces,"vez","veces"):""),
      '<button class="btn fuerte" id="cocinar">Cocinar paso a paso</button>'+
      '<button class="btn" id="hechaHoy">Hecha hoy</button>'+
      '<button class="btn" id="editar">Editar</button>')+

    '<div class="rejilla" style="grid-template-columns:minmax(240px,1fr) minmax(280px,2fr);'+
      'align-items:start;gap:16px">'+

      (tieneNutricion(r) || dietasDe(r).length
        ? '<div class="tarjeta"><div class="tarjeta-cab"><h2>Por ración</h2>'+
          '<span class="pista">Aproximado</span></div>'+
          '<div class="tarjeta-cuerpo">'+
            (tieneNutricion(r)
              ? '<table><tbody>'+
                [["Calorías", num(nutricionDe(r).kcal,0)+" kcal"],
                 ["Hidratos", num(nutricionDe(r).hidratos,0)+" g"],
                 ["Proteínas", num(nutricionDe(r).proteinas,0)+" g"],
                 ["Grasas", num(nutricionDe(r).grasas,0)+" g"]].map(function(f){
                   return '<tr><td>'+esc(f[0])+'</td><td class="num">'+esc(f[1])+'</td></tr>';
                 }).join("")+'</tbody></table>'
              : "")+
            (dietasDe(r).length
              ? '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:10px">'+
                dietasDe(r).map(function(d){
                  return '<span class="chapa ok">'+DIETAS[d].icono+' '+esc(DIETAS[d].nombre)+'</span>';
                }).join("")+'</div>'
              : "")+
            (tieneNutricion(r)
              ? '<p class="nota" style="margin:10px 0 0">Cifras aproximadas, para comparar '+
                'platos y poder contestar a quien pregunte.</p>'
              : "")+
          '</div></div>'
        : "")+

      '<div class="tarjeta"><div class="tarjeta-cab"><h2>Alérgenos</h2></div>'+
        '<div class="tarjeta-cuerpo" style="display:flex;flex-wrap:wrap;gap:6px">'+
          chapasAlergenos(alergenosDe(r))+'</div></div>'+

      '<div class="tarjeta"><div class="tarjeta-cab"><h2>Ingredientes</h2></div>'+
        '<div class="tarjeta-cuerpo">'+
          '<div style="display:flex;gap:8px;align-items:center;margin-bottom:12px">'+
            '<label class="lbl" for="r_rac" style="margin:0">Para</label>'+
            '<input type="number" id="r_rac" min="1" step="1" value="'+raciones+'" '+
              'style="width:80px">'+
            '<span class="nota" style="margin:0">raciones'+
              (raciones!==base?' · la receta es de '+base:"")+'</span>'+
          '</div>'+
          ((r.ingredientes||[]).length
            ? '<table><tbody>'+(r.ingredientes||[]).map(function(ing){
                var c=escalar(ing, raciones, base);
                return '<tr><td>'+esc(ing.que)+'</td>'+
                  '<td class="num">'+(c?esc(c)+" "+esc(ing.unidad||""):'<span style="color:var(--muted)">al gusto</span>')+
                  '</td></tr>';
              }).join("")+'</tbody></table>'
            : '<p class="nota" style="margin:0">Sin ingredientes apuntados.</p>')+
        '</div></div>'+

      '<div class="tarjeta"><div class="tarjeta-cab"><h2>Paso a paso</h2>'+
        '<span class="pista">Pulsa uno para tacharlo</span></div>'+
        '<div class="tarjeta-cuerpo">'+
          ((r.pasos||[]).length
            ? '<div class="pasos">'+(r.pasos||[]).map(function(p,i){
                return '<div class="paso'+(ui.hechos[i]?" hecho":"")+'" data-paso="'+i+'" '+
                  'style="cursor:pointer"><div class="n"></div><div class="t">'+esc(p)+'</div></div>';
              }).join("")+'</div>'
            : '<p class="nota" style="margin:0">Sin pasos apuntados. Dale a Editar y escríbelos, '+
              'uno por línea.</p>')+
          (r.notas?'<p class="nota" style="margin:14px 0 0;white-space:pre-wrap;'+
            'border-top:1px solid var(--linea-suave);padding-top:12px">'+esc(r.notas)+'</p>':"")+
        '</div></div>'+
    '</div>';

  document.getElementById("volver").addEventListener("click", function(){
    ui.receta=null; ui.raciones=null; pintar();
  });
  document.getElementById("cocinar").addEventListener("click", function(){ abrirCocina(r.id); });
  document.getElementById("editar").addEventListener("click", function(){ editarReceta(r.id); });
  document.getElementById("hechaHoy").addEventListener("click", function(){
    marcarHecha(r.id, hoyISO()); pintar(); avisar("Apuntada: hecha hoy");
  });
  document.getElementById("r_rac").addEventListener("input", function(){
    ui.raciones=Math.max(1, Math.round(+this.value||base)); verReceta();
    var v=document.getElementById("r_rac"); if(v) v.focus();
  });
  main.querySelectorAll("[data-paso]").forEach(function(p){
    p.addEventListener("click", function(){
      var i=p.dataset.paso;
      ui.hechos[i]=!ui.hechos[i];
      p.classList.toggle("hecho", !!ui.hechos[i]);
    });
  });
}

/* ══════════════════════════════════════════════════════════════
   COCINAR: UN PASO CADA VEZ
   ══════════════════════════════════════════════════════════════
   En la cocina no se lee una lista: se lee un paso, se hace, y se pasa
   al siguiente. Letra grande y dos botones, que las manos están
   ocupadas y a veces mojadas.
   ══════════════════════════════════════════════════════════════ */
function abrirCocina(recetaId){
  var r=recetaDe(recetaId);
  if(!r){ avisar("No encuentro esa receta.", true); return; }
  var pasos=(r.pasos||[]);
  if(!pasos.length){ avisar("Esa receta no tiene pasos escritos.", true); return; }

  var i=0;
  var capa=document.createElement("div");
  capa.className="cocina";
  document.body.appendChild(capa);

  function pinta(){
    capa.innerHTML=
      '<div class="arriba">'+
        '<div><div style="font-family:var(--titulo);font-size:18px">'+esc(r.nombre)+'</div>'+
        '<div class="cuenta">Paso '+(i+1)+' de '+pasos.length+
          (r.tiempo?' · '+esc(r.tiempo):"")+'</div></div>'+
        '<button class="btn" data-salir>Salir</button>'+
      '</div>'+
      '<div class="barra"><i style="width:'+((i+1)/pasos.length*100).toFixed(1)+'%"></i></div>'+
      '<div class="texto">'+esc(pasos[i])+'</div>'+
      '<div class="abajo">'+
        '<button class="btn grande" data-antes'+(i===0?" disabled":"")+'>← Anterior</button>'+
        (i<pasos.length-1
          ? '<button class="btn grande fuerte" data-siguiente>Siguiente →</button>'
          : '<button class="btn grande fuerte" data-acabar>Terminado ✓</button>')+
      '</div>';

    capa.querySelector("[data-salir]").addEventListener("click", cerrar);
    var antes=capa.querySelector("[data-antes]");
    if(antes) antes.addEventListener("click", function(){ if(i>0){ i--; pinta(); } });
    var sig=capa.querySelector("[data-siguiente]");
    if(sig) sig.addEventListener("click", function(){ if(i<pasos.length-1){ i++; pinta(); } });
    var fin=capa.querySelector("[data-acabar]");
    if(fin) fin.addEventListener("click", function(){
      marcarHecha(r.id, hoyISO());
      cerrar(); pintar(); avisar(r.nombre+": hecha y apuntada");
    });
  }

  function teclas(e){
    if(e.key==="ArrowRight" && i<pasos.length-1){ i++; pinta(); }
    else if(e.key==="ArrowLeft" && i>0){ i--; pinta(); }
    else if(e.key==="Escape") cerrar();
  }
  function cerrar(){
    document.removeEventListener("keydown", teclas);
    capa.remove();
  }
  document.addEventListener("keydown", teclas);
  pinta();
}

/* ══════════════════════════════════════════════════════════════
   EDITAR UNA RECETA
   ══════════════════════════════════════════════════════════════
   Los ingredientes y los pasos se escriben en texto corrido, una cosa
   por línea: es lo más rápido de teclear y lo más fácil de pegar desde
   donde los tengas ahora.
   ══════════════════════════════════════════════════════════════ */
function textoIngredientes(r){
  return (r.ingredientes||[]).map(function(i){
    return [i.cantidad, i.unidad, i.que].filter(function(x){ return x!=="" && x!=null; }).join(" ");
  }).join("\n");
}

/* «200 g harina», «2 cebollas», «sal». Lo que no empieza por número se
   queda entero como nombre: es un ingrediente al gusto. */
function leerIngrediente(linea){
  var t=String(linea||"").trim();
  if(!t) return null;
  var m=t.match(/^(\d+[.,]?\d*)\s*([a-zA-ZñÑ]+)?\s+(.*)$/);
  if(!m) return {cantidad:"", unidad:"", que:t};
  var unidadesConocidas=/^(g|gr|gramos?|kg|kilos?|l|lt|litros?|ml|cl|ud|uds|unidades?|cucharadas?|cdas?|cucharaditas?|pizcas?|dientes?|latas?|manojos?|hojas?|ramas?|vasos?|tazas?)$/i;
  var unidad=(m[2]&&unidadesConocidas.test(m[2])) ? m[2] : "";
  var que = unidad ? m[3] : ((m[2]?m[2]+" ":"")+m[3]);
  return {cantidad:m[1].replace(",","."), unidad:unidad, que:que.trim()};
}

function editarReceta(id){
  var nueva=!id;
  var r = id ? recetaDe(id)
             : {id:uid(), nombre:"", tipo:"primero", raciones:libro.ajustes.raciones||4,
                tiempo:"", ingredientes:[], pasos:[], notas:"", veces:0, ultima:""};
  if(!r) return;

  var d=abrirVentana(nueva?"Nueva receta":"Editar "+r.nombre,
    '<div class="rejilla" style="margin-bottom:12px">'+
      '<div class="campo" style="grid-column:1/-1"><label class="lbl" for="e_nom">Nombre</label>'+
        '<input id="e_nom" value="'+esc(r.nombre)+'" placeholder="Lentejas de la casa" '+
        'autocomplete="off">'+
        '<div id="e_formas" style="margin-top:6px"></div></div>'+
      '<div class="campo"><label class="lbl" for="e_tipo">Qué es</label><select id="e_tipo">'+
        ORDEN_TIPOS.map(function(k){
          return '<option value="'+k+'"'+(r.tipo===k?" selected":"")+'>'+
                 TIPOS[k].icono+' '+esc(TIPOS[k].nombre)+'</option>'; }).join("")+
      '</select></div>'+
      '<div class="campo"><label class="lbl" for="e_rac">Raciones</label>'+
        '<input type="number" id="e_rac" min="1" step="1" value="'+esc(r.raciones||"")+'"></div>'+
      '<div class="campo"><label class="lbl" for="e_tiempo">Cuánto lleva</label>'+
        '<input id="e_tiempo" value="'+esc(r.tiempo||"")+'" placeholder="45 min, 2 h…"></div>'+
    '</div>'+

    '<div class="campo" style="margin-bottom:12px">'+
      '<label class="lbl" for="e_ing">Ingredientes · uno por línea</label>'+
      '<textarea id="e_ing" rows="7" placeholder="400 g lentejas&#10;2 cebollas&#10;1 chorizo&#10;sal">'+
      esc(textoIngredientes(r))+'</textarea>'+
      '<span class="nota" style="margin:5px 0 0">Empieza por la cantidad y la unidad: '+
      '<span class="mono">400 g lentejas</span>. Lo que no lleve número se queda como '+
      '«al gusto» y no se multiplica al cambiar las raciones.</span></div>'+

    '<div class="campo" style="margin-bottom:12px">'+
      '<label class="lbl" for="e_pasos">Pasos · uno por línea</label>'+
      '<textarea id="e_pasos" rows="9" placeholder="Poner las lentejas en remojo la víspera&#10;'+
      'Pochar la cebolla a fuego suave&#10;Añadir el chorizo y dorarlo">'+
      esc((r.pasos||[]).join("\n"))+'</textarea>'+
      '<span class="nota" style="margin:5px 0 0">Cada línea es un paso de los que luego salen '+
      'de uno en uno en la cocina. Cuanto más corto, mejor se lee con las manos ocupadas.</span></div>'+

    '<div class="campo" style="margin-bottom:12px">'+
      '<label class="lbl">Para qué dietas vale</label>'+
      '<div style="display:flex;flex-wrap:wrap;gap:8px 14px;margin-top:4px">'+
        ORDEN_DIETAS.map(function(k){
          return '<label style="display:flex;gap:6px;align-items:center;cursor:pointer;font-size:13px">'+
            '<input type="checkbox" class="e_dieta" value="'+k+'" style="width:auto"'+
            (dietasDe(r).indexOf(k)>=0?" checked":"")+'>'+
            '<span>'+DIETAS[k].icono+' '+esc(DIETAS[k].nombre)+'</span></label>';
        }).join("")+
      '</div></div>'+

    '<p class="nota" style="margin:16px 0 8px">Por ración, más o menos</p>'+
    '<div class="rejilla" style="margin-bottom:4px">'+
      '<div class="campo"><label class="lbl" for="e_kcal">Calorías (kcal)</label>'+
        '<input type="number" id="e_kcal" min="0" step="1" value="'+
        esc(nutricionDe(r).kcal||"")+'"></div>'+
      '<div class="campo"><label class="lbl" for="e_hc">Hidratos (g)</label>'+
        '<input type="number" id="e_hc" min="0" step="1" value="'+
        esc(nutricionDe(r).hidratos||"")+'"></div>'+
      '<div class="campo"><label class="lbl" for="e_prot">Proteínas (g)</label>'+
        '<input type="number" id="e_prot" min="0" step="1" value="'+
        esc(nutricionDe(r).proteinas||"")+'"></div>'+
      '<div class="campo"><label class="lbl" for="e_gra">Grasas (g)</label>'+
        '<input type="number" id="e_gra" min="0" step="1" value="'+
        esc(nutricionDe(r).grasas||"")+'"></div>'+
    '</div>'+
    '<p class="nota" style="margin:0 0 12px">Son cifras aproximadas, para comparar unos '+
    'platos con otros y poder decirle algo a quien lo pregunte. No son un análisis.</p>'+

    '<div class="campo" style="margin-bottom:12px">'+
      '<label class="lbl">Alérgenos</label>'+
      '<div style="display:flex;flex-wrap:wrap;gap:8px 14px;margin-top:4px">'+
        ORDEN_ALERGENOS.map(function(k){
          return '<label style="display:flex;gap:6px;align-items:center;cursor:pointer;font-size:13px">'+
            '<input type="checkbox" class="e_alg" value="'+k+'" style="width:auto"'+
            (alergenosDe(r).indexOf(k)>=0?" checked":"")+'>'+
            '<span>'+ALERGENOS[k].icono+' '+esc(ALERGENOS[k].nombre)+'</span></label>';
        }).join("")+
      '</div>'+
      '<span class="nota" style="margin:6px 0 0">Marca lo que lleve de verdad el plato. '+
      'Se enseñan en la ficha y, juntos, en el menú del día: es lo que hay que poder decir '+
      'si alguien pregunta.</span></div>'+

    '<div class="campo"><label class="lbl" for="e_notas">Notas</label>'+
      '<textarea id="e_notas" rows="3" placeholder="Sale mejor con el caldo del día anterior…">'+
      esc(r.notas||"")+'</textarea></div>',

    function(){
      var nombre=valor("e_nom");
      if(!nombre){ avisar("Ponle nombre a la receta.", true); return true; }
      r.nombre=nombre;
      r.tipo=valor("e_tipo")||"primero";
      r.raciones=Math.max(1, Math.round(numero("e_rac")))||libro.ajustes.raciones||4;
      r.tiempo=valor("e_tiempo");
      r.ingredientes=(document.getElementById("e_ing").value||"").split("\n")
                       .map(leerIngrediente).filter(Boolean);
      r.pasos=(document.getElementById("e_pasos").value||"").split("\n")
                .map(function(x){ return x.trim(); }).filter(Boolean);
      r.notas=(document.getElementById("e_notas").value||"").trim();
      r.alergenos=Array.prototype.slice.call(document.querySelectorAll(".e_alg:checked"))
                    .map(function(x){ return x.value; });
      r.dieta=Array.prototype.slice.call(document.querySelectorAll(".e_dieta:checked"))
                .map(function(x){ return x.value; });
      r.nutricion={kcal:numero("e_kcal"), hidratos:numero("e_hc"),
                   proteinas:numero("e_prot"), grasas:numero("e_gra")};
      if(nueva) libro.recetas.push(r);
      guardar(); pintar();
      avisar(nueva?"Receta guardada":"Receta actualizada");
    },
    {aceptar:nueva?"Guardar receta":"Guardar",
     extra: nueva ? "" : '<button class="btn malo" id="e_borrar">Borrar</button>'});

  /* Al escribir el nombre, las maneras de hacerlo que la app conoce.
     Se elige una y se rellenan ingredientes y pasos, que es lo pesado. */
  var campoNombre=document.getElementById("e_nom");
  var cajaFormas=document.getElementById("e_formas");

  function rellenarCon(f){
    document.getElementById("e_tipo").value=f.tipo;
    document.getElementById("e_rac").value=f.raciones;
    document.getElementById("e_tiempo").value=f.tiempo||"";
    document.getElementById("e_ing").value=
      f.ing.map(function(x){
        var i=ingredienteDeTexto(x);
        return [i.cantidad, i.unidad, i.que].filter(function(y){ return y!==""; }).join(" ");
      }).join("\n");
    document.getElementById("e_pasos").value=f.pasos.join("\n");
    document.getElementById("e_notas").value=f.notas||"";
    document.querySelectorAll(".e_alg").forEach(function(c){
      c.checked = (f.alergenos||[]).indexOf(c.value)>=0;
    });
    avisar("Puesta la receta: cámbiala a tu gusto");
    pintarFormas();
  }

  function pintarFormas(){
    var hay=variantesPara(campoNombre.value);
    if(!hay){ cajaFormas.innerHTML=""; return; }
    var lleno = (document.getElementById("e_ing").value||"").trim() ||
                (document.getElementById("e_pasos").value||"").trim();
    cajaFormas.innerHTML=
      '<div class="nota" style="margin:0 0 5px">'+
        (lleno ? 'También sé hacerlo de estas formas. Al elegir una se cambia lo que hay escrito:'
               : 'Sé hacerlo de '+(hay.formas.length===1?"una forma":hay.formas.length+" formas")+
                 '. Elige una y te lo pongo, y luego lo cambias a tu gusto:')+
      '</div>'+
      '<div style="display:flex;gap:6px;flex-wrap:wrap">'+
        hay.formas.map(function(f,i){
          return '<button type="button" class="btn sm" data-forma="'+i+'">'+
                 esc(f.sub)+'</button>';
        }).join("")+
      '</div>';
    cajaFormas.querySelectorAll("[data-forma]").forEach(function(b){
      b.addEventListener("click", function(){
        var f=hay.formas[+b.dataset.forma];
        if(!lleno){ rellenarCon(f); return; }
        confirmar("Cambiar lo escrito",
          '<p style="margin:0">Se van a sustituir los ingredientes y los pasos que hay '+
          'ahora por los de <strong>'+esc(f.sub)+'</strong>.</p>',
          function(){ rellenarCon(f); }, {aceptar:"Sustituir", malo:true});
      });
    });
  }
  campoNombre.addEventListener("input", pintarFormas);
  pintarFormas();

  var borrar=document.getElementById("e_borrar");
  if(borrar) borrar.addEventListener("click", function(){
    d.close(); d.remove();
    confirmar("Borrar "+r.nombre,
      '<p style="margin:0 0 10px">Se va la receta con sus ingredientes y sus pasos.</p>'+
      (function(){
        var enMenus=(libro.menus||[]).filter(function(m){
          return ORDEN_TIPOS.some(function(t){ return m[t]===r.id; }); }).length;
        return enMenus
          ? '<p class="nota" style="margin:0">Está puesta en '+plural(enMenus,"menú","menús")+
            ': esos días se quedarán con ese hueco vacío.</p>'
          : '<p class="nota" style="margin:0">No está en ningún menú.</p>';
      })(),
      function(){
        libro.recetas=recetas().filter(function(x){ return x.id!==r.id; });
        (libro.menus||[]).forEach(function(m){
          ORDEN_TIPOS.forEach(function(t){ if(m[t]===r.id) m[t]=""; });
        });
        ui.receta=null; guardar(); pintar(); avisar("Receta borrada");
      }, {aceptar:"Borrar", malo:true});
  });
}

/* ══════════════════════════════════════════════════════════════
   LA SEMANA
   ══════════════════════════════════════════════════════════════ */
function verSemana(){
  var main=document.getElementById("main");
  var base=new Date((ui.dia||hoyISO())+"T12:00:00");
  /* De lunes a domingo, que es como se piensa la semana */
  var lunes=new Date(base);
  lunes.setDate(lunes.getDate() - ((lunes.getDay()+6)%7));

  var dias=[];
  for(var i=0;i<7;i++){
    var d=new Date(lunes); d.setDate(lunes.getDate()+i);
    dias.push(d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+
              String(d.getDate()).padStart(2,"0"));
  }

  main.innerHTML=
    cabecera("La semana",
      "De un vistazo, qué hay cada día. Pulsa un día para montarlo.",
      '<button class="btn" id="s_antes">← Semana anterior</button>'+
      '<button class="btn" id="s_hoy">Esta semana</button>'+
      '<button class="btn" id="s_luego">Siguiente →</button>')+

    '<div class="tarjeta"><div class="tabla-caja"><table><thead><tr>'+
      '<th>Día</th><th>🥣 Primero</th><th>🍖 Segundo</th><th>🍮 Postre</th><th>Nota</th>'+
      '</tr></thead><tbody>'+
      dias.map(function(f){
        var m=menuDe(f)||{};
        var esHoy=(f===hoyISO());
        function celda(t){
          var r=recetaDe(m[t]);
          if(!r) return '<td style="color:var(--muted)">—</td>';
          var ultima=ultimaVez(r.id, f);
          var dd=ultima?Math.round((new Date(f+"T12:00:00")-new Date(ultima+"T12:00:00"))/86400000):null;
          var repe = dd!=null && dd>=0 && dd<(+libro.ajustes.avisarDias||21);
          return '<td>'+esc(r.nombre)+
            (repe?' <span class="chapa aviso">'+
              (dd===0?"hoy mismo":dd===1?"ayer":"hace "+dd+" d")+'</span>':"")+'</td>';
        }
        return '<tr data-dia="'+f+'" style="cursor:pointer'+
          (esHoy?';background:var(--acento-suave)':"")+'">'+
          '<td><strong>'+esc(diaLargo(f).split(",")[0])+'</strong>'+
          '<div class="nota" style="margin:0">'+esc(dmy(f))+'</div></td>'+
          celda("primero")+celda("segundo")+celda("postre")+
          '<td class="nota" style="margin:0">'+esc(m.nota||"")+'</td></tr>';
      }).join("")+
    '</tbody></table></div></div>';

  main.querySelectorAll("[data-dia]").forEach(function(tr){
    tr.addEventListener("click", function(){
      ui.dia=tr.dataset.dia; ui.vista="hoy"; pintar();
    });
  });
  document.getElementById("s_antes").addEventListener("click", function(){
    var d=new Date(lunes); d.setDate(d.getDate()-7);
    ui.dia=d.toISOString().slice(0,10); pintar();
  });
  document.getElementById("s_luego").addEventListener("click", function(){
    var d=new Date(lunes); d.setDate(d.getDate()+7);
    ui.dia=d.toISOString().slice(0,10); pintar();
  });
  document.getElementById("s_hoy").addEventListener("click", function(){
    ui.dia=hoyISO(); pintar();
  });
}

/* ══════════════════════════════════════════════════════════════
   AJUSTES
   ══════════════════════════════════════════════════════════════ */
function verAjustes(){
  var main=document.getElementById("main");
  main.innerHTML=
    cabecera("Ajustes","Cómo se comporta el recetario.")+

    '<div class="tarjeta" style="max-width:560px;margin-bottom:16px">'+
      '<div class="tarjeta-cab"><h2>De serie</h2></div>'+
      '<div class="tarjeta-cuerpo"><div class="rejilla">'+
        '<div class="campo"><label class="lbl" for="a_rac">Raciones de siempre</label>'+
          '<input type="number" id="a_rac" min="1" step="1" value="'+
          esc(libro.ajustes.raciones||4)+'"></div>'+
        '<div class="campo"><label class="lbl" for="a_dias">Avisar si se repite antes de</label>'+
          '<input type="number" id="a_dias" min="0" step="1" value="'+
          esc(libro.ajustes.avisarDias||21)+'"></div>'+
      '</div>'+
      '<p class="nota" style="margin:12px 0 0">Al poner un plato en el menú, si se sirvió hace '+
      'menos de esos días sale el aviso. Ponlo a 0 y no avisa nunca.</p>'+
      '<button class="btn fuerte" id="a_guardar" style="margin-top:14px">Guardar</button>'+
      '</div></div>'+

    '<div class="tarjeta" style="max-width:560px;border-color:var(--malo)">'+
      '<div class="tarjeta-cab"><h2 style="color:var(--malo)">Borrar</h2>'+
        '<span class="pista">No tiene vuelta atrás</span></div>'+
      '<div class="tarjeta-cuerpo">'+
        '<p class="nota" style="margin:0 0 14px">Lo borrado se va también de GitHub.</p>'+
        '<div style="display:flex;flex-direction:column;gap:12px">'+
          '<div><button class="btn malo" id="b_menus">Borrar los menús</button>'+
            '<div class="nota" style="margin-top:4px">'+
            plural((libro.menus||[]).length,"día montado","días montados")+
            '. Las recetas se quedan.</div></div>'+
          '<div style="border-top:1px solid var(--linea);padding-top:12px">'+
            '<button class="btn malo fuerte" id="b_todo">Vaciar el recetario</button>'+
            '<div class="nota" style="margin-top:4px">Se van las '+
            plural(recetas().length,"receta","recetas")+' y los menús.</div></div>'+
        '</div></div></div>';

  document.getElementById("a_guardar").addEventListener("click", function(){
    libro.ajustes.raciones=Math.max(1, Math.round(numero("a_rac")))||4;
    libro.ajustes.avisarDias=Math.max(0, Math.round(numero("a_dias")));
    guardar(); pintar(); avisar("Ajustes guardados");
  });

  document.getElementById("b_menus").addEventListener("click", function(){
    if(!(libro.menus||[]).length){ avisar("No hay ningún menú montado.", true); return; }
    confirmar("Borrar los menús",
      '<p style="margin:0">Se van los '+(libro.menus||[]).length+' días montados. '+
      'Las recetas y sus fechas de última elaboración se quedan.</p>',
      function(){ libro.menus=[]; guardar(); pintar(); avisar("Menús borrados"); },
      {aceptar:"Borrar", malo:true});
  });

  document.getElementById("b_todo").addEventListener("click", function(){
    if(!recetas().length && !(libro.menus||[]).length){ avisar("Ya está vacío.", true); return; }
    abrirVentana("Vaciar el recetario",
      '<p style="margin:0 0 12px">Se van <strong>'+plural(recetas().length,"receta","recetas")+
      '</strong> con sus pasos, y los menús montados.</p>'+
      '<div class="campo"><label class="lbl" for="b_palabra">Escribe BORRAR para confirmarlo</label>'+
        '<input id="b_palabra" class="mono" placeholder="BORRAR" autocomplete="off"></div>',
      function(){
        if(valor("b_palabra").toUpperCase()!=="BORRAR"){
          avisar("Escribe BORRAR para confirmarlo.", true); return true;
        }
        libro.recetas=[]; libro.menus=[];
        guardar(); pintar(); avisar("Recetario vacío");
      }, {aceptar:"Vaciar", malo:true});
  });
}

/* ══════════════════════════════════════════════════════════════ */
cargar();
pintar();

})();
