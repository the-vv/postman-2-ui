export function readText(file: File): Promise<string> {
  return file.text();
}

export function pickFiles(accept = '.json,.html,.htm,application/json,text/html', multiple = true): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.onchange = () => resolve(Array.from(input.files ?? []));
    input.click();
  });
}
