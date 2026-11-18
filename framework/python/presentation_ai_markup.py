"""Validate a portable HTML/SVG body and declarative timeline, not executable JS."""
from html import escape
from html.parser import HTMLParser
import math
import re

TAGS=set('div p span strong em b i small h2 h3 h4 ul ol li table thead tbody tfoot tr td th caption figure figcaption img br svg g rect circle ellipse line path polyline polygon text tspan defs lineargradient radialgradient stop'.split())
ATTRS=set('class id style role aria-label data-asset-id alt width height viewbox x y x1 y1 x2 y2 cx cy r rx ry d points fill stroke stroke-width opacity text-anchor dominant-baseline transform offset stop-color stop-opacity colspan rowspan preserveaspectratio'.split())
CSS=set('display flex flex-direction flex-wrap flex-grow flex-shrink flex-basis align-items align-self justify-content justify-items place-items gap row-gap column-gap grid-template-columns grid-template-rows grid-column grid-row width height min-width max-width min-height max-height padding padding-top padding-right padding-bottom padding-left margin margin-top margin-right margin-bottom margin-left box-sizing border border-top border-right border-bottom border-left border-color border-width border-style border-radius box-shadow background background-color color font-size font-weight font-style line-height letter-spacing text-align text-decoration white-space word-break overflow overflow-wrap object-fit object-position position top left right bottom opacity transform transform-origin vertical-align table-layout border-collapse border-spacing'.split())


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
    def __init__(self,assets):super().__init__(convert_charrefs=True);self.assets=assets;self.stack=[];self.output=[];self.count=0
    def handle_starttag(self,tag,attrs):
        self.count+=1
        if tag not in TAGS or self.count>1200 or len(self.stack)>30:raise ValueError('본문 HTML/SVG 요소를 확인해 주세요.')
        output=[]
        for name,value in attrs:
            if name not in ATTRS or value is None or len(value)>6000:raise ValueError('허용하지 않는 본문 속성입니다: '+name)
            if name=='style':value=safe_style(value)
            if name=='data-asset-id' and (tag!='img' or value not in self.assets):raise ValueError('본문 사진 참조를 확인해 주세요.')
            if name in ('fill','stroke') and (re.search(r'url\s*\(',value,re.I) and not re.fullmatch(r'url\(#[\w-]+\)',value,re.I) or re.search(r'javascript|https?:|data:',value,re.I)):raise ValueError('SVG 외부 참조를 사용할 수 없습니다.')
            output.append(f' {name}="{escape(value,quote=True)}"')
        if tag=='img' and not any(k=='data-asset-id' for k,_ in attrs):raise ValueError('사진은 제공된 자산 ID로 지정해 주세요.')
        self.output.append('<'+tag+''.join(output)+'>')
        if tag not in ('img','br'):self.stack.append(tag)
    def handle_endtag(self,tag):
        if tag in ('img','br'):return
        if not self.stack or self.stack.pop()!=tag:raise ValueError('본문 HTML 태그 짝을 확인해 주세요.')
        self.output.append('</'+tag+'>')
    def handle_startendtag(self,tag,attrs):self.handle_starttag(tag,attrs);self.handle_endtag(tag)
    def handle_data(self,data):self.output.append(escape(data))
    def handle_decl(self,decl):raise ValueError('본문 선언문을 사용할 수 없습니다.')
    def handle_pi(self,data):raise ValueError('본문 실행 코드를 사용할 수 없습니다.')


def validate_page(page,assets):
    if not isinstance(page,dict) or set(page)-{'html','duration','effects'} or not isinstance(page.get('html'),str) or not 1<=len(page['html'])<=60000:raise ValueError('AI 본문 형식을 확인해 주세요.')
    duration=page.get('duration',8)
    if type(duration) not in (int,float) or not math.isfinite(duration) or not 1<=duration<=120:raise ValueError('본문 효과 시간은 1~120초로 지정해 주세요.')
    parser=PageParser(assets);parser.feed(page['html']);parser.close()
    if parser.stack or not parser.count:raise ValueError('본문 HTML 태그 짝을 확인해 주세요.')
    effects=page.get('effects',[])
    if not isinstance(effects,list) or len(effects)>60:raise ValueError('본문 효과는 최대 60개입니다.')
    for effect in effects:
        if not isinstance(effect,dict) or set(effect)-{'selector','at','duration','type'} or not re.fullmatch(r'[.#][a-zA-Z][\w-]{0,79}',effect.get('selector','')) or effect.get('type') not in ('fade','slide-up','slide-left','scale'):raise ValueError('본문 효과 대상을 확인해 주세요.')
        at=effect.get('at');span=effect.get('duration')
        if any(type(v) not in (int,float) or not math.isfinite(v) for v in (at,span)) or at<0 or span<=0 or at+span>duration:raise ValueError('본문 효과 시간이 장표 범위를 벗어났습니다.')
    return {'html':''.join(parser.output),'duration':duration,'effects':effects}
