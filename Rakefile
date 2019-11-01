
task :default => :preview
 
desc 'Build site with Jekyll'
task :build do
  jekyll 'build'
end
 
desc 'Build and start server with --watch'
task :serve do
  jekyll 'serve --watch'
end

desc 'Build and deploy'
task :deploy => :build do
  sh 'rsync -avzth --exclude ".DS_Store" --progress --delete _site/ root@159.203.96.113:/var/www/beta.seethroughlab.com'
end

def jekyll(opts = '')
  sh 'rm -rf _site'
  sh 'bundle exec jekyll ' + opts
end