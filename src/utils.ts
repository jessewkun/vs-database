import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

const VIEW_PATH = 'src/views/'

export function getExtensionFileVscodeResource(context: vscode.ExtensionContext, relativePath: string): string {
    const diskPath = vscode.Uri.file(path.join(context.extensionPath, relativePath));
    return diskPath.with({ scheme: 'vscode-resource' }).toString();
}

export function getWebViewContent(context: vscode.ExtensionContext, templatePath: string) {
    const resourcePath = path.join(context.extensionPath, VIEW_PATH + templatePath);
    const dirPath = path.dirname(resourcePath);
    let html = fs.readFileSync(resourcePath, 'utf-8');
    // vscode不支持直接加载本地资源，需要替换成其专有路径格式，这里只是简单的将样式和JS的路径替换
    html = html.replace(/(<link.+?href="|<script.+?src="|<img.+?src=")(.+?)"/g, (m, $1, $2) => {
        return $1 + vscode.Uri.file(path.resolve(dirPath, $2)).with({ scheme: 'vscode-resource' }).toString() + '"';
    });
    return html;
}