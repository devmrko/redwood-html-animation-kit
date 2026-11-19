"""Validate a portable HTML/SVG body and declarative timeline, not executable JS."""
from html import escape
from html.parser import HTMLParser
import math
import re

TAGS=set('div section article header footer p span strong em b i small h2 h3 h4 ul ol li dl dt dd table colgroup col thead tbody tfoot tr td th caption figure figcaption img br svg title desc g rect circle ellipse line path polyline polygon text tspan defs marker lineargradient radialgradient stop'.split())
ATTRS=set('class id style role aria-label aria-labelledby aria-hidden xmlns data-asset-id alt loading decoding width height viewbox x y x1 y1 x2 y2 cx cy r rx ry d points fill fill-rule fill-opacity stroke stroke-width stroke-opacity stroke-dasharray stroke-dashoffset stroke-linecap stroke-linejoin pathlength vector-effect marker-start marker-mid marker-end markerwidth markerheight markerunits refx refy orient opacity text-anchor dominant-baseline font-size font-weight transform offset stop-color stop-opacity colspan rowspan preserveaspectratio'.split())
CSS=set('fill stroke stroke-width stroke-dasharray stroke-dashoffset stroke-linecap stroke-linejoin stop-color stop-opacity transform-box display flex flex-direction flex-wrap flex-grow flex-shrink flex-basis align-items align-self justify-content justify-items place-items gap row-gap column-gap grid-template-columns grid-template-rows grid-column grid-row width height min-width max-width min-height max-height padding padding-top padding-right padding-bottom padding-left margin margin-top margin-right margin-bottom margin-left box-sizing border border-top border-right border-bottom border-left border-color border-width border-style border-radius box-shadow background background-color color font-size font-weight font-style line-height letter-spacing text-align text-decoration white-space word-break overflow overflow-wrap object-fit object-position position top left right bottom opacity transform transform-origin vertical-align table-layout border-collapse border-spacing'.split())


def safe_style(value):
    if len(value)>4000 or re.search(r'url\s*\(|expression|@|\\|[<>]',value,re.I):raise ValueError('본문 스타일에 외부 참조·실행 코드를 사용할 수 없습니다.')
    declarations=[]
    for declaration in value.split(';'):
        if not declaration.strip():continue
        if ':' not in declaration:raise ValueError('본문 스타일 형식을 확인해 주세요.')
        name,item=map(str.strip,declaration.split(':',1))
        if name.lower()=='font-family':continue
        declarations.append(declaration)
        if name.lower() not in CSS or not re.fullmatch(r'[\w\s#%().,:+*/!\-]+',item) or name=='position' and item not in ('relative','absolute','static'):raise ValueError('허용하지 않는 본문 스타일입니다: '+name)
    return ';'.join(declarations)


class PageParser(HTMLParser):
    def __init__(self,assets):super().__init__(convert_charrefs=True);self.assets=assets;self.stack=[];self.output=[];self.count=0;self.selectors=set()
    def handle_starttag(self,tag,attrs):
        self.count+=1
        if tag not in TAGS:raise ValueError('허용하지 않는 본문 요소입니다: '+tag[:80])
        if self.count>1200 or len(self.stack)>30:raise ValueError('본문 요소 수·중첩 깊이를 줄여 주세요.')
        output=[]
        for name,value in attrs:
            if name=='font-family':continue
            if name not in ATTRS or value is None or len(value)>6000:raise ValueError('허용하지 않는 본문 속성입니다: '+name)
            if name=='style':value=safe_style(value)
            if name=='xmlns' and (tag!='svg' or value!='http://www.w3.org/2000/svg'):raise ValueError('SVG 네임스페이스를 확인해 주세요.')
            if name=='class':self.selectors.update('.'+token for token in value.split())
            if name=='id':self.selectors.add('#'+value)
            if name=='data-asset-id' and (tag!='img' or value not in self.assets):raise ValueError('본문 사진 참조를 확인해 주세요.')
            if name in ('fill','stroke','marker-start','marker-mid','marker-end') and (re.search(r'url\s*\(',value,re.I) and not re.fullmatch(r'url\(#[\w-]+\)',value,re.I) or re.search(r'javascript|https?:|data:',value,re.I)):raise ValueError('SVG 외부 참조를 사용할 수 없습니다.')
            output.append(f' {name}="{escape(value,quote=True)}"')
        if tag=='img' and not any(k=='data-asset-id' for k,_ in attrs):raise ValueError('사진은 제공된 자산 ID로 지정해 주세요.')
        self.output.append('<'+tag+''.join(output)+'>')
        if tag not in ('img','br','col'):self.stack.append(tag)
    def handle_endtag(self,tag):
        if tag in ('img','br','col'):return
        if not self.stack or self.stack.pop()!=tag:raise ValueError('본문 HTML 태그 짝을 확인해 주세요.')
        self.output.append('</'+tag+'>')
    def handle_startendtag(self,tag,attrs):self.handle_starttag(tag,attrs);self.handle_endtag(tag)
    def handle_data(self,data):self.output.append(escape(data))
    def handle_decl(self,decl):raise ValueError('본문 선언문을 사용할 수 없습니다.')
    def handle_pi(self,data):raise ValueError('본문 실행 코드를 사용할 수 없습니다.')


def validate_page(page,assets):
    if not isinstance(page,dict) or set(page)-{'html','duration','effects'} or not isinstance(page.get('html'),str) or not 1<=len(page['html'])<=60000:raise ValueError('AI 본문 형식을 확인해 주세요.')
    duration=page.get('duration',8)
    if type(duration) not in (int,float) or not math.isfinite(duration) or not 1<=duration<=120:raise ValueError('page.duration은 1~120 범위의 숫자(초)여야 합니다. ms·문자열·객체를 넣지 마세요.')
    parser=PageParser(assets);parser.feed(page['html']);parser.close()
    if parser.stack or not parser.count:raise ValueError('본문 HTML 태그 짝을 확인해 주세요.')
    effects=page.get('effects',[])
    if not isinstance(effects,list) or len(effects)>60:raise ValueError('본문 효과는 최대 60개입니다.')
    for effect in effects:
        if not isinstance(effect,dict) or set(effect)-{'selector','at','duration','type'} or not re.fullmatch(r'[.#][a-zA-Z][\w-]{0,79}',effect.get('selector','')) or effect.get('type') not in ('fade','slide-up','slide-left','scale'):raise ValueError('effects는 {selector:".실제class", at:0.5, duration:0.6, type:"fade"} 형식입니다. type은 fade/slide-up/slide-left/scale 중 하나이고 selector는 단일 .class 또는 #id입니다. 다른 필드를 넣지 마세요.')
        if effect['selector'] not in parser.selectors:raise ValueError('본문에 효과 대상이 없습니다: '+effect['selector'])
        at=effect.get('at');span=effect.get('duration')
        if any(type(v) not in (int,float) or not math.isfinite(v) for v in (at,span)) or at<0 or span<=0 or at+span>duration:raise ValueError('본문 효과 시간이 장표 범위를 벗어났습니다.')
    return {'html':''.join(parser.output),'duration':duration,'effects':effects}
