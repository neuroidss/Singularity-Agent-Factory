#!/usr/bin/python3
import os
import sys

def collect_files(root_dir, output_file):
    root_dir = os.path.abspath(root_dir)
    with open(output_file, 'w', encoding='utf-8') as outfile:
        for dirpath, _, filenames in os.walk(root_dir):
            for filename in filenames:
                full_path = os.path.join(dirpath, filename)
                rel_path = os.path.relpath(full_path, root_dir)
                
                # Write file header
                outfile.write(f"# {rel_path}\n")
                
                # Write file content block
                try:
                    with open(full_path, 'r', encoding='utf-8') as infile:
                        content = infile.read()
                    outfile.write(f"```{rel_path}\n{content}\n```\n\n")
                except UnicodeDecodeError:
                    outfile.write(f"```{rel_path}\n[VIBE_CODING_BOT: BINARY FILE]\n```\n\n")
                except Exception as e:
                    outfile.write(f"```{rel_path}\n[VIBE_CODING_BOT: ERROR READING FILE - {str(e)}]\n```\n\n")

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python file_collector.py <input_directory> <output_file>")
        sys.exit(1)
    
    input_dir = sys.argv[1]
    output_file = sys.argv[2]
    
    if not os.path.isdir(input_dir):
        print(f"Error: {input_dir} is not a valid directory")
        sys.exit(1)
    
    collect_files(input_dir, output_file)
    print(f"Successfully collected files to {output_file}")
