import os
import subprocess
from PIL import Image

def convert_svg_to_png():
    icons_dir = 'icons'
    magick_path = r'C:\Program Files\ImageMagick-7.1.1-Q16-HDRI\magick.exe'
    
    print(f"Scanning directory: {icons_dir}")
    
    if not os.path.exists(icons_dir):
        print(f"Error: Directory {icons_dir} does not exist!")
        return
        
    if not os.path.exists(magick_path):
        print(f"Error: ImageMagick not found at {magick_path}")
        return
        
    svg_files = [f for f in os.listdir(icons_dir) if f.endswith('.svg')]
    print(f"Found SVG files: {svg_files}")
    
    for file in svg_files:
        svg_path = os.path.join(icons_dir, file)
        png_path = os.path.join(icons_dir, file.replace('.svg', '.png'))
        
        print(f"\nProcessing {file}:")
        
        try:
            # Используем ImageMagick для конвертации (новый синтаксис)
            subprocess.run([magick_path, svg_path, png_path], check=True)
            print(f'Successfully converted {file} to PNG')
            
            # Оптимизируем размер PNG
            with Image.open(png_path) as img:
                img.save(png_path, optimize=True)
                
        except subprocess.CalledProcessError as e:
            print(f'Error converting {file}: {str(e)}')
        except Exception as e:
            print(f'Error processing {file}: {str(e)}')

if __name__ == '__main__':
    convert_svg_to_png() 