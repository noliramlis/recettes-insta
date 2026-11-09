// Dictionnaire d'ingrédients : « nom canonique: variante, variante… » par catégorie.
// Les pluriels simples (s/x), accents et majuscules sont gérés automatiquement :
// inutile d'écrire « tomates » si « tomate » est là. Les variantes regroupent sous
// un même nom (ex. « tomate cerise » → tomate) ; quelques noms anglais sont inclus.
// Pour ajouter un ingrédient : une ligne de plus dans la bonne catégorie.
const INGREDIENT_DATA = {
  'Légumes': `
tomate: tomate cerise, tomato, tomatoes, cherry tomatoes, coulis de tomate, concentré de tomate, sauce tomate, pulpe de tomate, passata, tomates concassées
pomme de terre: patate, grenaille, potato, potatoes
patate douce: sweet potato, sweet potatoes
oignon: oignon rouge, oignon jaune, oignon blanc, oignon nouveau, cébette, onion, red onion, spring onion, green onion
échalote: shallot
ail: gousse d'ail, ail semoule, garlic
poireau: leek
carotte: carrot
courgette: zucchini, courgette jaune
aubergine: eggplant
poivron: bell pepper, red pepper, green pepper, yellow pepper
piment: piment rouge, piment vert, chili, jalapeño, jalapeno, piment d'espelette, espelette, piment de cayenne, cayenne, chili flakes
concombre: cucumber
salade: laitue, roquette, mâche, mesclun, sucrine, romaine, batavia, lettuce, arugula, rocket
épinard: pousses d'épinard, spinach
chou: chou blanc, chou rouge, chou vert, chou kale, kale, cabbage
chou-fleur: cauliflower
brocoli: broccoli
chou de bruxelles: brussels sprouts
champignon: champignon de paris, cèpe, girolle, shiitake, pleurote, morille, mushroom
haricot vert: haricots verts, green beans
petit pois: petits pois, peas
fève: broad beans
asperge: asparagus
artichaut: artichoke
avocat: avocado
betterave: beetroot, beet
radis: radish, radishes
navet: turnip
panais: parsnip
céleri: céleri branche, céleri-rave, celeri rave, celery
fenouil: fennel
potiron: potimarron, butternut, courge, citrouille, pumpkin, squash
maïs: corn
endive: chicon
blette: bette, blettes
cresson: watercress
gingembre: ginger
olive: olives noires, olives vertes, olives
câpre: capers
cornichon: pickles
`,
  'Fruits': `
citron: citron vert, citron jaune, zeste de citron, jus de citron, lemon, lime, lemon juice
orange: orange sanguine, zeste d'orange, jus d'orange
pamplemousse: grapefruit
pomme: apple, apples, compote de pomme
poire: pear
banane: banana
fraise: strawberry, strawberries
framboise: raspberry, raspberries
myrtille: blueberry, blueberries
mûre: blackberry, blackberries
cassis
cerise: cherry, cherries
fruits rouges: fruits rouges surgelés, mixed berries, berries
abricot: apricot
pêche: nectarine, brugnon, peach, peaches
prune: quetsche, mirabelle, plum
raisin: raisin sec, raisins secs, grapes, raisins
figue: fig
datte: dattes medjool
mangue: mango
ananas: pineapple
kiwi
fruit de la passion: maracuja, passion fruit
grenade: pomegranate
melon
pastèque: watermelon
rhubarbe: rhubarb
coco: noix de coco, coco râpée, coconut, desiccated coconut
`,
  'Viandes': `
poulet: blanc de poulet, filet de poulet, cuisse de poulet, haut de cuisse, pilon, volaille, chicken, chicken breast
dinde: escalope de dinde, turkey
canard: magret, magret de canard, confit de canard, duck
bœuf: steak, entrecôte, rumsteck, paleron, bavette, bourguignon, viande hachée, steak haché, viande de bœuf, beef, ground beef, minced beef
veau: escalope de veau, blanquette, veal
porc: filet mignon, échine, côte de porc, travers de porc, pork, pulled pork
agneau: gigot, épaule d'agneau, lamb
lardon: lardons fumés, bacon, poitrine fumée, poitrine de porc
jambon: jambon blanc, jambon cru, jambon de parme, prosciutto, serrano, speck, ham
chorizo
saucisse: chipolata, merguez, saucisse de toulouse, saucisse de morteau, sausage
pancetta: guanciale
`,
  'Poissons & fruits de mer': `
saumon: pavé de saumon, saumon fumé, salmon, smoked salmon
thon: thon en boîte, tuna
cabillaud: dos de cabillaud, morue, colin, merlu, lieu noir, poisson blanc, cod, white fish
dorade: daurade, bar, loup, sea bass
truite: trout
sardine
maquereau: mackerel
anchois: anchovies
crevette: gambas, scampi, shrimp, prawns
moule: mussels
noix de saint-jacques: saint-jacques, saint jacques, scallops
calamar: encornet, seiche, poulpe, squid, octopus
crabe: surimi, crab
poisson: fish
`,
  'Œufs & produits laitiers': `
œuf: jaune d'œuf, blanc d'œuf, jaunes d'œufs, blancs d'œufs, egg, eggs, egg yolk, egg white
beurre: beurre doux, beurre demi-sel, beurre salé, noix de beurre, butter
crème: crème fraîche, crème liquide, crème entière, crème épaisse, crème fleurette, crème semi-épaisse, crème végétale, cream, heavy cream, sour cream
lait: lait entier, lait demi-écrémé, lait concentré, lait végétal, lait d'amande, lait d'avoine, milk
yaourt: yaourt grec, yogourt, yoghourt, skyr, fromage blanc, faisselle, yogurt, greek yogurt
fromage râpé: emmental, gruyère, comté, cheddar, beaufort, shredded cheese
parmesan: parmigiano, grana padano, pecorino
mozzarella: mozza, burrata, mozzarella di bufala
feta: féta
chèvre: bûche de chèvre, crottin, fromage de chèvre, goat cheese
ricotta
mascarpone
fromage frais: st môret, saint môret, philadelphia, cream cheese, boursin, carré frais
raclette
reblochon
camembert: brie
roquefort: gorgonzola, bleu d'auvergne, fourme d'ambert
halloumi
`,
  'Féculents & céréales': `
pâtes: pasta, spaghetti, spaghettis, tagliatelle, tagliatelles, penne, fusilli, linguine, rigatoni, farfalle, macaroni, coquillettes, orzo, lasagne, lasagnes, ravioli, gnocchi, conchiglioni, pappardelle, orecchiette
nouilles: nouilles chinoises, nouilles de riz, udon, soba, ramen, vermicelles de riz, noodles, rice noodles
riz: riz basmati, riz thaï, riz rond, riz arborio, risotto, rice
quinoa
boulgour: bulgur
semoule: couscous
polenta
farine: farine de blé, farine t45, farine t55, farine t65, maïzena, fécule, fécule de maïs, flour, cornstarch
flocons d'avoine: avoine, porridge, oats, rolled oats
pain: baguette, pain de mie, pain complet, brioche, pita, tortilla, wrap, galette de blé, bread
pâte feuilletée: puff pastry
pâte brisée: shortcrust
pâte sablée
pâte à pizza: pizza dough
chapelure: panko, breadcrumbs
`,
  'Légumineuses & soja': `
pois chiche: chickpeas, chickpea, houmous, hummus
lentille: lentilles corail, lentilles vertes, lentils
haricot rouge: kidney beans
haricot blanc: white beans, cannellini
edamame
tofu: tofu soyeux, tofu fumé
`,
  'Herbes & épices': `
basilic: basil
persil: parsley
coriandre: cilantro, coriander
ciboulette: chives
menthe: mint
aneth: dill
thym: thyme
romarin: rosemary
laurier: bay leaf
estragon: tarragon
origan: oregano, herbes de provence
sauge
cumin
curry: pâte de curry, curry paste, garam masala, tandoori
paprika: paprika fumé, smoked paprika
curcuma: turmeric
cannelle: cinnamon
muscade: noix de muscade, nutmeg
gingembre en poudre
ras el hanout
cardamome: cardamom
safran: saffron
zaatar: za'atar
sumac
vanille: gousse de vanille, extrait de vanille, sucre vanillé, vanilla
`,
  'Épicerie & sauces': `
huile d'olive: huile olive, olive oil
huile de sésame: sesame oil
sauce soja: soja sucrée, tamari, soy sauce
moutarde: moutarde à l'ancienne, mustard
vinaigre: vinaigre balsamique, balsamique, vinaigre de cidre, vinaigre de riz, vinegar
miel: honey
sirop d'érable: maple syrup
lait de coco: crème de coco, coconut milk, coconut cream
bouillon: bouillon de volaille, bouillon de légumes, cube de bouillon, fond de veau, stock, broth
vin blanc: white wine
vin rouge: red wine
pesto: pesto rouge
tahini: tahin, crème de sésame
harissa
mayonnaise: mayo
ketchup
sauce nuoc mam: nuoc mam, fish sauce
sriracha: sauce piquante, hot sauce, tabasco
pâte de miso: miso
mirin
sauce worcestershire
`,
  'Sucré & pâtisserie': `
sucre: sucre en poudre, sucre roux, cassonade, vergeoise, sucre de coco, sucre glace, sugar, brown sugar, icing sugar
chocolat: chocolat noir, chocolat au lait, chocolat blanc, pépites de chocolat, chocolate, chocolate chips
cacao: cacao en poudre, cocoa
levure chimique: levure, poudre à lever, baking powder, bicarbonate, baking soda
levure boulangère: levure de boulanger, levure sèche, yeast
gélatine: agar-agar, agar agar
caramel: caramel au beurre salé
pâte à tartiner: nutella
confiture: jam
crème de marrons: marrons, châtaigne
biscuit: spéculoos, speculoos, petit beurre, boudoirs, biscuits
`,
  'Noix & graines': `
amande: poudre d'amande, amandes effilées, almond, almonds, almond flour
noisette: poudre de noisette, hazelnut, hazelnuts
noix: cerneaux de noix, walnut, walnuts
noix de cajou: cajou, cashew, cashews
pistache: pistachio, pistachios
cacahuète: arachide, cacahouète, peanut, peanuts
beurre de cacahuète: beurre de cacahouète, peanut butter
pignon de pin: pignons, pine nuts
graine de sésame: sésame, sesame
graine de chia: chia
graine de courge: pumpkin seeds
graine de tournesol: sunflower seeds
graine de lin: flax
`,
};

// Mots reconnus mais jamais indexés (trop présents pour aider à chercher).
const INGREDIENT_IGNORED = ['sel', 'fleur de sel', 'poivre', 'poivre noir', 'eau', 'huile', 'huile neutre',
  'salt', 'pepper', 'black pepper', 'water', 'oil'];

if (typeof module !== 'undefined') module.exports = { INGREDIENT_DATA, INGREDIENT_IGNORED };
